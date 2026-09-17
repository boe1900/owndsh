/**
 * [INPUT]: 依赖真实 Base UI 分类选择器、插件登记表单、Query 管理页与 Testing Library。
 * [OUTPUT]: 验证多选/自定义/去重/移除、表单提交隔离、数量边界和跨分页分类复用。
 * [POS]: features/plugins 的分类交互验收，模拟仅限服务端 HTTP 与浏览器布局观测能力。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import { PluginCategorySelect } from './plugin-category-select';
import { RegisterPluginVersionDialog } from './plugin-editors';
import { PluginManagementPage } from './plugin-management-page';

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ bootstrap: { permissions: ['ent:plugin:read', 'ent:plugin:write'] } })
}));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('selects existing categories, creates a literal custom label, removes chips, and only submits on save', async () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<RegisterPluginVersionDialog categoryOptions={['团队专用']} categoriesLoading={false} categoriesError={false}
    onRetryCategories={vi.fn()} onClose={onClose} onSave={onSave} saving={false} />);
  fireEvent.change(screen.getByLabelText('包名'), { target: { value: '@company/plugin' } });
  fireEvent.change(screen.getByLabelText('版本'), { target: { value: '1.0.0' } });
  const input = screen.getByRole('combobox', { name: '分类' });
  fireEvent.click(screen.getByRole('button', { name: '展开分类选项' }));
  fireEvent.click(await screen.findByRole('option', { name: '开发工具' }));
  fireEvent.input(input, { inputType: 'insertText', target: { value: '团队' } });
  fireEvent.click(await screen.findByRole('option', { name: '团队专用' }));
  fireEvent.input(input, { inputType: 'insertText', target: { value: '研发, 运维' } });
  const create = await screen.findByRole('option', { name: '创建分类「研发, 运维」' });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  await waitFor(() => expect(screen.getByRole('button', { name: '移除分类 研发, 运维' })).toBeDefined());
  expect(create).toBeDefined();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.input(input, { inputType: 'insertText', target: { value: '研发, 运维' } });
  expect(screen.queryByRole('option', { name: '创建分类「研发, 运维」' })).toBeNull();
  fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '移除分类 开发工具' }));
  fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    installation: expect.objectContaining({ categories: ['团队专用', '研发, 运维'] })
  }));
});

it('keeps removal available at the 12-category limit and caps the input length', async () => {
  function Field() {
    const [value, setValue] = useState(Array.from({ length: 12 }, (_, index) => `分类${index}`));
    return <PluginCategorySelect options={[]} value={value} onChange={setValue} />;
  }
  render(<Field />);
  const input = screen.getByRole('combobox', { name: '分类' });
  expect(input.getAttribute('maxlength')).toBe('40');
  fireEvent.input(input, { inputType: 'insertText', target: { value: '新分类' } });
  const create = await screen.findByRole('option', { name: '创建分类「新分类」' });
  expect(create.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(create);
  expect(screen.queryByRole('button', { name: '移除分类 新分类' })).toBeNull();
  fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: '移除分类 分类0' }));
  fireEvent.input(input, { inputType: 'insertText', target: { value: '新分类' } });
  fireEvent.click(await screen.findByRole('option', { name: '创建分类「新分类」' }));
  expect(await screen.findByRole('button', { name: '移除分类 新分类' })).toBeDefined();
  expect(screen.getByText('12 / 12')).toBeDefined();
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
        installation: { spec: 'plugin@1.0.0', displayName: '插件', categories: [second ? '第二页分类' : '第一页分类'] } }]
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
