/**
 * [INPUT]: 依赖 TanStack Table v9 headless 行为与 coss UI Frame/Table/Pagination/InputGroup/Select/Menu/Checkbox/Button/Spinner/Alert。
 * [OUTPUT]: 提供产品资源列表共享的 ProductDataTable 与 coss 风格单元格原语（TableStatusBadge / TableStackCell）：固定列宽预算、防撑爆截断、表头吸顶、表体内滚与底部分页器钉住。
 * [POS]: components/product 的表格唯一实现，不持有领域查询或 mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef
} from '@tanstack/react-table';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  Columns3Icon,
  SearchIcon,
  XIcon
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Frame, FrameFooter } from '@/components/ui/frame';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink
} from '@/components/ui/pagination';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type ProductColumnMeta = {
  label?: string;
  width?: number;
  className?: string;
  cellClassName?: string;
};

export const productTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: {
    equalsString: filterFn_equalsString,
    includesString: filterFn_includesString
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    text: sortFn_text
  },
  columnMeta: {} as ProductColumnMeta
});

export type ProductTableColumn<TData extends object> = ColumnDef<
  typeof productTableFeatures,
  TData,
  any
>;

export type ProductTableFilter = {
  columnId: string;
  defaultFilterValue?: string;
  label: string;
  options: ReadonlyArray<{ label: string; value: string }>;
};

type ProductDataTableProps<TData extends object> = {
  ariaLabel: string;
  className?: string;
  columns: ReadonlyArray<ProductTableColumn<TData>>;
  data: ReadonlyArray<TData>;
  emptyText: string;
  getRowId: (row: TData) => string;
  searchPlaceholder: string;
  filter?: ProductTableFilter;
  hasMore?: boolean;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  error?: unknown;
  onLoadMore?: () => void;
  onRetry?: () => void;
  selectable?: boolean;
  selectionActions?: (rows: ReadonlyArray<TData>, clearSelection: () => void) => ReactNode;
  toolbarFilters?: ReactNode;
  toolbarAction?: ReactNode;
  showColumnToggle?: boolean;
};

export type TableStatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const STATUS_DOT_CLASS: Record<TableStatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-muted-foreground/64'
};

/** 遵循 coss UI Table 示例的描边状态点徽章，统一所有表格的状态列外观。 */
export function TableStatusBadge({
  label,
  tone
}: {
  label: string;
  tone: TableStatusTone;
}) {
  return (
    <Badge variant="outline">
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', STATUS_DOT_CLASS[tone])} />
      {label}
    </Badge>
  );
}

/** 遵循 coss UI 表格排版的两行截断单元格：主标题与可选次级说明/等宽副标。 */
export function TableStackCell({
  primary,
  primaryBadge,
  secondary,
  monoSecondary = true
}: {
  primary: string;
  primaryBadge?: ReactNode;
  secondary?: string;
  monoSecondary?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium text-foreground" title={primary}>
          {primary}
        </span>
        {primaryBadge}
      </div>
      {secondary ? (
        <div
          className={cn(
            'truncate text-xs text-muted-foreground',
            monoSecondary && 'font-mono'
          )}
          title={secondary}
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

function columnPixelWidth(size: number | undefined, className: string | undefined): number | undefined {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) return size;
  if (!className) return undefined;
  const pxMatch = /\bw-\[(\d+)px\]/.exec(className);
  if (pxMatch) return Number(pxMatch[1]);
  const scaleMatch = /\bw-(\d+)\b/.exec(className);
  if (scaleMatch) return Number(scaleMatch[1]) * 4;
  return undefined;
}

function tableErrorMessage(error: unknown) {
  if (error instanceof Error && error.message !== '') return error.message;
  return '暂时无法读取数据';
}

export function ProductDataTable<TData extends object>({
  ariaLabel,
  className,
  columns,
  data,
  emptyText,
  error,
  filter,
  getRowId,
  hasMore = false,
  isLoading = false,
  isLoadingMore = false,
  onLoadMore,
  onRetry,
  searchPlaceholder,
  selectable,
  selectionActions,
  toolbarAction,
  showColumnToggle = true,
  toolbarFilters
}: ProductDataTableProps<TData>) {
  const rowSelectionEnabled = selectable ?? Boolean(selectionActions);

  const selectionColumn: ProductTableColumn<TData> = {
    id: 'select',
    header: ({ table }) => {
      const isAllSelected = table.getIsAllPageRowsSelected();
      const isSomeSelected = table.getIsSomePageRowsSelected();
      return (
        <Checkbox
          checked={isAllSelected}
          indeterminate={isSomeSelected && !isAllSelected}
          aria-label="选择当前页"
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
        />
      );
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        aria-label={`选择第 ${row.getDisplayIndex() + 1} 行`}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
      />
    ),
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    meta: { label: '选择', width: 40, className: 'w-10', cellClassName: 'w-10' }
  };

  const table = useTable(
    {
      features: productTableFeatures,
      columns: rowSelectionEnabled ? [selectionColumn, ...columns] : columns,
      data,
      getRowId,
      enableRowSelection: rowSelectionEnabled,
      globalFilterFn: 'includesString',
      initialState: {
        columnFilters: filter?.defaultFilterValue
          ? [{ id: filter.columnId, value: filter.defaultFilterValue }]
          : [],
        pagination: { pageIndex: 0, pageSize: 10 }
      },
      autoResetPageIndex: true
    },
    (state) => ({
      columnFilters: state.columnFilters,
      columnVisibility: state.columnVisibility,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      rowSelection: state.rowSelection,
      sorting: state.sorting
    })
  );

  const statusColumn = filter ? table.getColumn(filter.columnId) : undefined;
  const filteredRows = table.getPrePaginatedRowModel().rows;
  const filteredCount = filteredRows.length;
  const selectedIds = table.getSelectedRowIds();
  const selectedIdSet = new Set(selectedIds);
  const selectedRows = rowSelectionEnabled
    ? filteredRows.map((row) => row.original).filter((item) => selectedIdSet.has(getRowId(item)))
    : [];
  const selectedCount = selectedRows.length;
  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const visibleColumnCount = visibleColumns.length;
  const minTableWidth = visibleColumns.reduce((sum, column) => {
    const meta = column.columnDef.meta as ProductColumnMeta | undefined;
    return sum + (columnPixelWidth(meta?.width, meta?.className) ?? 160);
  }, 0);
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;
  const pageSize = table.state.pagination.pageSize;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (container) container.scrollTop = 0;
    setIsScrolled(false);
  }, [pageIndex, pageSize]);

  useEffect(() => {
    if (!rowSelectionEnabled || selectedIds.length === 0) return;
    const validIds = new Set(filteredRows.map((row) => row.id));
    if (selectedIds.some((id) => !validIds.has(id))) {
      table.setRowSelection(
        Object.fromEntries(selectedIds.filter((id) => validIds.has(id)).map((id) => [id, true] as const))
      );
    }
  }, [filteredRows, rowSelectionEnabled, selectedIds, table]);

  const filterItems = filter
    ? [{ value: '', label: filter.label }, ...filter.options]
    : [];
  const pageSizeItems = [10, 20, 50].map((size) => ({ value: String(size), label: `${size} / 页` }));
  const clearSelection = () => table.resetRowSelection(true);

  return (
    <section aria-label={ariaLabel} className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-3', className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <InputGroup className="min-w-[190px] flex-1 sm:max-w-[320px]">
            <InputGroupAddon>
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              size="sm"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={String(table.state.globalFilter ?? '')}
              onChange={(event) => {
                table.setGlobalFilter(event.target.value);
                table.firstPage();
              }}
            />
          </InputGroup>
          {filter && statusColumn ? (
            <Select
              items={filterItems}
              value={String(statusColumn.getFilterValue() ?? '')}
              onValueChange={(next) => {
                statusColumn.setFilterValue(next ?? '');
                table.firstPage();
              }}
            >
              <SelectTrigger aria-label={filter.label} size="sm" className="w-fit min-w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {filterItems.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          {toolbarFilters}
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
          {toolbarAction}
          {showColumnToggle ? (
            <Menu>
              <MenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
                <Columns3Icon aria-hidden />
                列
              </MenuTrigger>
              <MenuPopup align="end" className="min-w-44">
                {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => {
                  const meta = column.columnDef.meta as ProductColumnMeta | undefined;
                  return (
                    <MenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={() => column.toggleVisibility()}
                    >
                      {meta?.label ?? column.id}
                    </MenuCheckboxItem>
                  );
                })}
              </MenuPopup>
            </Menu>
          ) : null}
        </div>
      </div>

      {rowSelectionEnabled && selectedCount > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-xs shadow-xs/5">
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="gap-1.5"
            title="点击取消选择"
            onClick={clearSelection}
          >
            <span>已选择 {selectedCount} 项</span>
            <XIcon aria-hidden className="size-3 text-muted-foreground" />
          </Button>
          {selectionActions ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {selectionActions(selectedRows, clearSelection)}
            </div>
          ) : null}
        </div>
      ) : null}

      <Frame className="min-h-0 w-full">
        <Table
          variant="card"
          className="table-fixed"
          style={minTableWidth > 0 ? { minWidth: `${minTableWidth}px` } : undefined}
          render={
            <div
              ref={tableContainerRef}
              className="min-h-0 overflow-y-auto rounded-xl"
              data-scrolled={isScrolled ? 'true' : undefined}
              onScroll={(event) => {
                const next = event.currentTarget.scrollTop > 0;
                setIsScrolled((prev) => (prev === next ? prev : next));
              }}
            />
          }
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ProductColumnMeta | undefined;
                  const sort = header.column.getIsSorted();
                  const width = columnPixelWidth(meta?.width, meta?.className);
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
                      style={width || isScrolled ? {
                        ...(width ? { width: `${width}px` } : {}),
                        ...(isScrolled ? {
                          backgroundColor: 'var(--background)',
                          backgroundImage: 'linear-gradient(color-mix(in srgb, var(--muted) 72%, transparent), color-mix(in srgb, var(--muted) 72%, transparent))'
                        } : {})
                      } : undefined}
                      className={cn(
                        'sticky top-0 z-20 transition-shadow',
                        isScrolled && 'shadow-[inset_0_-1px_0_0_var(--border)]',
                        meta?.className
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex h-full cursor-pointer select-none items-center justify-between gap-2"
                          onClick={(event) => {
                            header.column.getToggleSortingHandler()?.(event);
                            table.firstPage();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              header.column.getToggleSortingHandler()?.(event);
                              table.firstPage();
                            }
                          }}
                        >
                          <table.FlexRender header={header} />
                          {sort === 'asc' ? (
                            <ChevronUpIcon aria-label="升序" className="size-4 shrink-0 opacity-80" />
                          ) : sort === 'desc' ? (
                            <ChevronDownIcon aria-label="降序" className="size-4 shrink-0 opacity-80" />
                          ) : null}
                        </div>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-24 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    正在读取
                  </span>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-24 text-center whitespace-normal">
                  <div className="mx-auto inline-flex max-w-md flex-col items-center gap-3">
                    <Alert variant="error">
                      <AlertDescription>{tableErrorMessage(error)}</AlertDescription>
                      {onRetry ? (
                        <AlertAction>
                          <Button type="button" size="xs" variant="outline" onClick={onRetry}>重试</Button>
                        </AlertAction>
                      ) : null}
                    </Alert>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-24 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as ProductColumnMeta | undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={meta?.cellClassName}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <FrameFooter className="shrink-0 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
              <p className="m-0 text-sm text-muted-foreground">每页</p>
              <Select
                items={pageSizeItems}
                value={String(table.state.pagination.pageSize)}
                onValueChange={(next) => {
                  if (next) table.setPageSize(Number(next));
                }}
              >
                <SelectTrigger aria-label="每页行数" size="sm" className="w-fit min-w-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {pageSizeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <p className="m-0 text-sm text-muted-foreground">
                第 <strong className="font-medium text-foreground">{pageCount === 0 ? 0 : pageIndex + 1} / {pageCount}</strong> 页 · 共{' '}
                <strong className="font-medium text-foreground">{filteredCount}</strong> 项{hasMore ? '，仍有更多' : ''}
              </p>
              {hasMore && onLoadMore ? (
                <Button type="button" size="sm" variant="outline" disabled={isLoadingMore} onClick={onLoadMore}>
                  {isLoadingMore ? '加载中' : '加载更多'}
                </Button>
              ) : null}
            </div>

            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationLink
                    aria-label="上一页"
                    className="max-sm:aspect-square max-sm:p-0"
                    size="sm"
                    render={
                      <Button
                        type="button"
                        disabled={!table.getCanPreviousPage()}
                        onClick={() => table.previousPage()}
                        size="sm"
                        variant="outline"
                      />
                    }
                  >
                    <ChevronLeftIcon className="sm:-ms-1" />
                    <span className="max-sm:hidden">上一页</span>
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink
                    aria-label="下一页"
                    className="max-sm:aspect-square max-sm:p-0"
                    size="sm"
                    render={
                      <Button
                        type="button"
                        disabled={!table.getCanNextPage()}
                        onClick={() => table.nextPage()}
                        size="sm"
                        variant="outline"
                      />
                    }
                  >
                    <span className="max-sm:hidden">下一页</span>
                    <ChevronRightIcon className="sm:-me-1" />
                  </PaginationLink>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </FrameFooter>
      </Frame>
    </section>
  );
}
