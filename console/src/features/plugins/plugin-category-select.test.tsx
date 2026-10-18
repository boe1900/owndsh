/**
 * [INPUT]: 依赖真实 Base UI 分类选择器、插件登记表单、Query 管理页与 Testing Library。
 * [OUTPUT]: 验证单分类选择、创建、替换、清空、键盘与表单隔离和跨目录分页复用。
 * [POS]: features/plugins 的分类交互验收，模拟仅限服务端 HTTP 与浏览器布局观测能力。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import { RegisterPluginVersionDialog } from './plugin-editors';
import { PluginManagementPage } from './plugin-management-page';

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ bootstrap: { permissions: ['ent:plugin:read', 'ent:plugin:write'] } })
}));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('selects, replaces, clears and creates one category without submitting the form', async () => {
  const onSave = vi.fn();
  render(<RegisterPluginVersionDialog categoryOptions={['团队专用']} categoriesLoading={false} categoriesError={false}
    onRetryCategories={vi.fn()} onClose={vi.fn()} onSave={onSave} saving={false} />);
  fireEvent.change(screen.getByLabelText('包名'), { target: { value: '@company/plugin' } });
  fireEvent.change(screen.getByLabelText('版本'), { target: { value: '1.0.0' } });
  const input = screen.getByRole('combobox', { name: '分类' });
  fireEvent.click(screen.getByRole('button', { name: '展开分类选项' }));
  fireEvent.click(await screen.findByRole('option', { name: '开发工具' }));
  expect(input).toHaveProperty('value', '开发工具');
  fireEvent.click(screen.getByRole('button', { name: '展开分类选项' }));
  fireEvent.click(await screen.findByRole('option', { name: '团队专用' }));
  expect(screen.queryByRole('button', { name: '清除分类 开发工具' })).toBeNull();
  expect(screen.getByRole('button', { name: '清除分类 团队专用' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '清除分类 团队专用' }));
  fireEvent.change(input, { target: { value: '研发, 运维' } });
  fireEvent.click(screen.getByRole('button', { name: '展开分类选项' }));
  const create = await screen.findByRole('option', { name: '创建分类「研发, 运维」' });
  fireEvent.click(create);
  await waitFor(() => expect(input).toHaveProperty('value', '研发, 运维'));
  expect(create).toBeDefined();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    installation: expect.objectContaining({ category: '研发, 运维' })
  }));
});

it('loads categories beyond the first catalog page when opening registration', async () => {
  client.setConfig({ baseUrl: 'http://localhost' });
  const cursors: Array<string | null> = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const cursor = new URL(request.url).searchParams.get('cursor');
    cursors.push(cursor);
    const second = cursor === 'next';
    return new Response(JSON.stringify({ data: { items: [{
      id: second ? '2' : '1', packageName: second ? 'plugin-two' : 'plugin-one', displayName: '插件', revision: 1, assignments: [],
      versions: [{ id: second ? '22' : '11', packageName: 'plugin', version: '1.0.0', status: 'PUBLISHED', createdAt: '2026-09-17T00:00:00Z',
        installation: { spec: 'plugin@1.0.0', displayName: '插件', category: second ? '第二页分类' : '第一页分类' } }]
    }], page: { hasMore: !second, nextCursor: second ? null : 'next' } } }), { headers: { 'Content-Type': 'application/json' } });
  }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><PluginManagementPage /></QueryClientProvider>);
  await screen.findByText('第一页分类');
  fireEvent.click(screen.getByRole('button', { name: '添加插件' }));
  await waitFor(() => expect(cursors).toEqual([null, 'next']));
  fireEvent.input(screen.getByRole('combobox', { name: '分类' }), { inputType: 'insertText', target: { value: '第二页' } });
  expect(await screen.findByRole('option', { name: '第二页分类' })).toBeDefined();
});
