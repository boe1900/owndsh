/**
 * [INPUT]: 依赖 TanStack Table v9 headless 行为、Beautiful UI tokens、现有 Button 与 Lucide 图标。
 * [OUTPUT]: 提供产品资源列表共享的 ProductDataTable、列定义和筛选类型。
 * [POS]: components/product 的表格唯一实现，保留上游 RecordsTable 原样作为视觉参考，不持有领域查询或 mutation。
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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  LoaderCircle,
  Search
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { cn } from '@/lib/utils';

type ProductColumnMeta = {
  label?: string;
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
  label: string;
  options: ReadonlyArray<{ label: string; value: string }>;
};

type ProductDataTableProps<TData extends object> = {
  ariaLabel: string;
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
  toolbarAction?: ReactNode;
};

function TableCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (event: unknown) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={input}
      type="checkbox"
      checked={checked}
      aria-label={label}
      aria-checked={indeterminate ? 'mixed' : checked}
      onChange={onChange}
      className="size-4 shrink-0 cursor-pointer rounded border-line accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    />
  );
}

function tableErrorMessage(error: unknown) {
  if (error instanceof Error && error.message !== '') return error.message;
  return '暂时无法读取数据';
}

export function ProductDataTable<TData extends object>({
  ariaLabel,
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
  toolbarAction
}: ProductDataTableProps<TData>) {
  const selectionColumn: ProductTableColumn<TData> = {
    id: 'select',
    header: ({ table }) => (
      <TableCheckbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
        label="选择当前页"
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <TableCheckbox
        checked={row.getIsSelected()}
        label={`选择第 ${row.getDisplayIndex() + 1} 行`}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    meta: { label: '选择', className: 'w-11', cellClassName: 'w-11' }
  };

  const table = useTable(
    {
      features: productTableFeatures,
      columns: [selectionColumn, ...columns],
      data,
      getRowId,
      globalFilterFn: 'includesString',
      initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
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
  const selectedCount = table.getSelectedRowIds().length;
  const filteredCount = table.getPrePaginatedRowModel().rows.length;
  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.05)]" aria-label={ariaLabel}>
      <div className="flex min-h-13 flex-wrap items-center justify-between gap-2 border-b border-line-strong px-2.5 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="relative min-w-[190px] flex-1 sm:max-w-[320px]">
            <span className="sr-only">{searchPlaceholder}</span>
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={String(table.state.globalFilter ?? '')}
              onChange={(event) => {
                table.setGlobalFilter(event.target.value);
                table.firstPage();
              }}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-lg border border-line bg-canvas pl-8 pr-3 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint"
            />
          </label>
          {filter && statusColumn ? (
            <select
              aria-label={filter.label}
              value={String(statusColumn.getFilterValue() ?? '')}
              onChange={(event) => {
                statusColumn.setFilterValue(event.target.value);
                table.firstPage();
              }}
              className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
            >
              <option value="">{filter.label}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : null}
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={() => table.resetRowSelection(true)}
              className="h-8 rounded-lg bg-accent-tint px-2.5 text-[12px] font-medium text-accent-ink hover:bg-hover"
            >
              已选择 {selectedCount} 项
            </button>
          ) : null}
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
          {toolbarAction}
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              <Columns3 aria-hidden className="size-3.5" />
              列
            </summary>
            <div className="absolute right-0 z-30 mt-1.5 min-w-44 rounded-lg border border-line-strong bg-surface p-1.5 shadow-overlay">
              {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => {
                const meta = column.columnDef.meta as ProductColumnMeta | undefined;
                return (
                  <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover">
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                      className="size-3.5 accent-accent"
                    />
                    {meta?.label ?? column.id}
                  </label>
                );
              })}
            </div>
          </details>
        </div>
      </div>

      <div className="max-h-[min(60vh,620px)] overflow-auto overscroll-contain" tabIndex={0}>
        <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-left text-[13px] text-ink">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ProductColumnMeta | undefined;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        'sticky top-0 z-10 h-9 border-b border-r border-line bg-surface px-3 text-[12px] font-medium text-ink-2 last:border-r-0',
                        meta?.className
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            header.column.getToggleSortingHandler()?.(event);
                            table.firstPage();
                          }}
                          className="flex h-full w-full items-center gap-1.5 text-left hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <table.FlexRender header={header} />
                          {sorted === 'asc' ? <ArrowUp aria-label="升序" className="size-3.5" /> : sorted === 'desc' ? <ArrowDown aria-label="降序" className="size-3.5" /> : <ArrowUpDown aria-hidden className="size-3.5 text-ink-3" />}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="h-48 border-b border-line text-center text-ink-3">
                  <span className="inline-flex items-center gap-2"><LoaderCircle aria-hidden className="size-4 animate-spin" />正在读取</span>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="h-48 border-b border-line text-center">
                  <div role="alert" className="inline-flex flex-col items-center gap-3 text-[13px] text-red">
                    {tableErrorMessage(error)}
                    {onRetry ? <Button size="xs" onClick={onRetry}>重试</Button> : null}
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="h-48 border-b border-line text-center text-[13px] text-ink-3">
                  {emptyText}
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className={cn('group', row.getIsSelected() && 'bg-accent-tint/55')}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as ProductColumnMeta | undefined;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'h-12 overflow-hidden border-b border-r border-line px-3 align-middle font-normal last:border-r-0 group-hover:bg-hover/55',
                        meta?.cellClassName
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px] text-ink-3">
        <span>{filteredCount} 项{hasMore ? '，仍有更多' : ''}</span>
        <div className="flex items-center gap-1.5">
          {hasMore && onLoadMore ? (
            <Button size="xs" disabled={isLoadingMore} onClick={onLoadMore}>
              {isLoadingMore ? '加载中' : '加载更多'}
            </Button>
          ) : null}
          <select
            aria-label="每页行数"
            value={table.state.pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink-2 outline-none focus:border-accent"
          >
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size} / 页</option>)}
          </select>
          <span className="min-w-16 text-center">{pageCount === 0 ? 0 : pageIndex + 1} / {pageCount}</span>
          <button
            type="button"
            aria-label="上一页"
            title="上一页"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-hover disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="下一页"
            title="下一页"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-hover disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </footer>
    </section>
  );
}
