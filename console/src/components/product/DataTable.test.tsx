/**
 * [INPUT]: 依赖 Testing Library、Vitest 与 ProductDataTable 的 TanStack Table v9 + coss UI 行为。
 * [OUTPUT]: 验证业务默认筛选、搜索、精确筛选、行选择、列显隐和分页共享语义。
 * [POS]: components/product 的最小行为门禁，防止资源页面各自重复或破坏表格状态机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProductDataTable,
  TableStackCell,
  TableStatusBadge,
  type ProductTableColumn
} from './DataTable';

type Item = { id: string; name: string; status: 'ACTIVE' | 'DISABLED' };

const columns: ReadonlyArray<ProductTableColumn<Item>> = [
  { accessorKey: 'name', header: '名称', meta: { label: '名称' } },
  {
    accessorKey: 'status',
    header: '状态',
    filterFn: 'equalsString',
    meta: { label: '状态' }
  }
];

const data: Item[] = Array.from({ length: 11 }, (_, index) => ({
  id: String(index + 1),
  name: index === 10 ? 'Zulu' : `Item ${String(index + 1).padStart(2, '0')}`,
  status: index % 2 === 0 ? 'ACTIVE' : 'DISABLED'
}));

afterEach(cleanup);

function chooseSelectOption(triggerLabel: string, optionLabel: string) {
  fireEvent.click(screen.getByRole('combobox', { name: triggerLabel }));
  const option = screen.getByRole('option', { name: optionLabel });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

describe('ProductDataTable', () => {
  it('applies a business-provided default filter without changing the shared default', () => {
    render(
      <ProductDataTable
        ariaLabel="资源"
        columns={columns}
        data={data}
        emptyText="暂无资源"
        filter={{
          columnId: 'status',
          defaultFilterValue: 'ACTIVE',
          label: '全部状态',
          options: [
            { label: '启用', value: 'ACTIVE' },
            { label: '停用', value: 'DISABLED' }
          ]
        }}
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
      />
    );

    expect(screen.getByRole('combobox', { name: '全部状态' }).textContent).toContain('启用');
    expect(screen.getByText('Item 01')).toBeTruthy();
    expect(screen.queryByText('Item 02')).toBeNull();
  });

  it('keeps rich table behavior in one shared component', () => {
    render(
      <ProductDataTable
        ariaLabel="资源"
        columns={columns}
        data={data}
        emptyText="暂无资源"
        filter={{
          columnId: 'status',
          label: '全部状态',
          options: [
            { label: '启用', value: 'ACTIVE' },
            { label: '停用', value: 'DISABLED' }
          ]
        }}
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
        selectionActions={(rows) => <button type="button">批量操作 ({rows.length})</button>}
      />
    );

    expect(screen.queryByText('Zulu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('Zulu')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索资源' }), { target: { value: 'Item 02' } });
    expect(screen.getByText('Item 02')).toBeTruthy();
    expect(screen.queryByText('Item 01')).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索资源' }), { target: { value: '' } });
    chooseSelectOption('全部状态', '停用');
    expect(screen.getByText('Item 02')).toBeTruthy();
    expect(screen.queryByText('Item 01')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: '选择第 1 行' }));
    expect(screen.getByRole('button', { name: '已选择 1 项' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '批量操作 (1)' })).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: '选择当前页' }));
    expect(screen.getByRole('button', { name: '已选择 5 项' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '已选择 5 项' }));
    expect(screen.queryByText(/已选择/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '列' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '状态' }));
    expect(screen.queryByRole('columnheader', { name: /状态/ })).toBeNull();
  });

  it('omits row checkboxes when selection is not enabled', () => {
    render(
      <ProductDataTable
        ariaLabel="只读资源"
        columns={columns}
        data={data}
        emptyText="暂无资源"
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
      />
    );

    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('clears a business-provided default filter when selecting all statuses', () => {
    render(
      <ProductDataTable
        ariaLabel="资源"
        columns={columns}
        data={data}
        emptyText="暂无资源"
        filter={{
          columnId: 'status',
          defaultFilterValue: 'ACTIVE',
          label: '全部状态',
          options: [
            { label: '启用', value: 'ACTIVE' },
            { label: '停用', value: 'DISABLED' }
          ]
        }}
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
      />
    );

    chooseSelectOption('全部状态', '全部状态');

    expect(screen.getByRole('combobox', { name: '全部状态' }).textContent).toContain('全部状态');
    expect(screen.getByText('Item 01')).toBeTruthy();
    expect(screen.getByText('Item 02')).toBeTruthy();
  });

  it('prunes the selection bar when selected rows disappear from data', () => {
    const view = render(
      <ProductDataTable
        ariaLabel="资源"
        columns={columns}
        data={data}
        emptyText="暂无资源"
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
        selectable
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '选择第 1 行' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择第 2 行' }));
    expect(screen.getByRole('button', { name: '已选择 2 项' })).toBeTruthy();

    view.rerender(
      <ProductDataTable
        ariaLabel="资源"
        columns={columns}
        data={data.filter((item) => item.id !== '1' && item.id !== '2')}
        emptyText="暂无资源"
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
        selectable
      />
    );

    expect(screen.queryByText(/已选择/)).toBeNull();
    expect(screen.getByText('Item 03')).toBeTruthy();
  });

  it('tracks vertical scroll state for sticky header divider and resets scroll on page change', () => {
    render(
      <ProductDataTable
        ariaLabel="资源"
        columns={columns}
        data={data}
        emptyText="暂无资源"
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
      />
    );

    const container = document.querySelector('[data-slot="table-container"]') as HTMLDivElement;
    const headerCell = document.querySelector('[data-slot="table-head"]') as HTMLTableCellElement;
    expect(container).toBeTruthy();
    expect(container.getAttribute('data-scrolled')).toBeNull();
    expect(headerCell.style.backgroundColor).toBe('');

    container.scrollTop = 48;
    fireEvent.scroll(container);
    expect(container.getAttribute('data-scrolled')).toBe('true');
    expect(headerCell.style.backgroundColor).toBe('var(--background)');

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(container.scrollTop).toBe(0);
    expect(container.getAttribute('data-scrolled')).toBeNull();
    expect(headerCell.style.backgroundColor).toBe('');
  });

  it('enforces fixed table column widths and renders coss status/stack cells', () => {
    const sizedColumns: ReadonlyArray<ProductTableColumn<Item>> = [
      {
        accessorKey: 'name',
        header: '名称',
        cell: ({ row }) => <TableStackCell primary={row.original.name} secondary={row.original.id} />,
        meta: { label: '名称', className: 'w-[240px]', cellClassName: 'w-[240px]' }
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ getValue }) => (
          <TableStatusBadge
            tone={getValue() === 'ACTIVE' ? 'success' : 'neutral'}
            label={getValue() === 'ACTIVE' ? '启用' : '停用'}
          />
        ),
        meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
      }
    ];

    render(
      <ProductDataTable
        ariaLabel="固定列宽资源"
        columns={sizedColumns}
        data={data.slice(0, 2)}
        emptyText="暂无资源"
        getRowId={(row) => row.id}
        searchPlaceholder="搜索资源"
        selectable
      />
    );

    const table = document.querySelector('[data-slot="table"]') as HTMLTableElement;
    expect(table.className).toContain('table-fixed');
    expect(table.style.minWidth).toBe('380px');
    expect(screen.getByText('启用')).toBeTruthy();
    expect(screen.getByText('停用')).toBeTruthy();
  });
});
