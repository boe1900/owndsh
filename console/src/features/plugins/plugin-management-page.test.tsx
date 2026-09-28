/**
 * [INPUT]: 依赖插件编辑器/管理页、生成 SDK、Query 与 Testing Library，HTTP 使用可控响应。
 * [OUTPUT]: 验证 npm 表单、插件聚合行、历史版本操作、保存后发布衔接、双 revision 范围迁移和失败草稿保留。
 * [POS]: features/plugins 的升级交互回归；真实事务与规则保留由服务端 PostgreSQL 验收。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import type { PluginPackage, PluginRegistrationRequest, PluginVersion } from '@/api/generated/types.gen';
import { registrationValue, RegisterPluginVersionDialog } from './plugin-editors';
import { PluginManagementPage } from './plugin-management-page';

const access = vi.hoisted(() => ({ permissions: ['ent:plugin:read', 'ent:plugin:write'] }));
vi.mock('@tanstack/react-router', () => ({ useRouteContext: () => ({ bootstrap: access }) }));
const base: PluginVersion = {
  id: '11', packageId: '1', packageName: '@company/plugin', version: '1.0.0', status: 'PUBLISHED', revision: 1,
  createdAt: '2026-09-18T00:00:00Z', installation: {
    spec: '@company/plugin@1.0.0', displayName: '代码审查', description: '检查变更', author: '研发团队',
    repositoryUrl: 'https://github.com/company/plugin', categories: ['开发工具', '团队专用']
  }
};
let pluginPackage: PluginPackage;
let writes: Array<{ path: string; revision: string | null; body?: unknown }>;
let saveFailure = false;
let publishConflict = false;

beforeEach(() => {
  access.permissions = ['ent:plugin:read', 'ent:plugin:write'];
  writes = []; saveFailure = false; publishConflict = false;
  pluginPackage = {
    id: '1', packageName: base.packageName, displayName: base.installation.displayName, status: 'ACTIVE', revision: 7,
    versions: [{ ...base, id: '12', version: '1.1.0', installation: { ...base.installation, spec: '@company/plugin@1.1.0' } }, structuredClone(base)],
    assignments: [
      { id: '101', packageId: '1', pluginVersionId: '11', subjectType: 'ALL', subjectId: null, desiredState: 'INSTALLED', required: false, status: 'ACTIVE', revision: 0 },
      { id: '102', packageId: '1', pluginVersionId: '12', subjectType: 'USER', subjectId: '123', desiredState: 'INSTALLED', required: false, status: 'ACTIVE', revision: 0 },
      { id: '103', packageId: '1', pluginVersionId: '11', subjectType: 'USER', subjectId: '124', desiredState: 'ABSENT', required: false, status: 'ACTIVE', revision: 0 }
    ]
  };
  client.setConfig({ baseUrl: 'http://localhost' });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (request.method === 'POST') {
      const text = await request.text();
      const body = text ? JSON.parse(text) : undefined;
      writes.push({ path, revision: request.headers.get('If-Match'), body });
      if (path.endsWith('/versions')) {
        if (saveFailure) return respond({ error: { code: 'ENT_INVALID_REQUEST', message: '安装目标不可用' } }, 400);
        const created: PluginVersion = { ...base, ...body as PluginRegistrationRequest, id: '13', status: 'VALIDATED', revision: 0 };
        pluginPackage = { ...pluginPackage, revision: 8, versions: [created, ...pluginPackage.versions] };
        return respond({ data: created }, 201);
      }
      if (path.endsWith('/actions/publish')) {
        if (publishConflict) return respond({ error: { code: 'ENT_REVISION_CONFLICT', message: '可见范围已被修改，请关闭后重新发布。' } }, 409);
        return respond({ data: { ...pluginPackage.versions[0], status: 'PUBLISHED', revision: 1 } });
      }
      throw new Error(`Unexpected write: ${path}`);
    }
    return respond({ data: { items: path.endsWith('/plugins') ? [pluginPackage] : [], page: { hasMore: false, nextCursor: null, limit: 100 } } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><PluginManagementPage /></QueryClientProvider>);
}

describe('plugin registration', () => {
  it('registers an exact npm version without a file', () => {
    expect(registrationValue({ packageName: ' @company/plugin ', version: '1.2.3' })).toEqual({
      packageName: '@company/plugin', version: '1.2.3', installation: {
        spec: '@company/plugin@1.2.3', displayName: '@company/plugin', description: '',
        author: '', repositoryUrl: '', categories: []
      }
    });
  });
  it('keeps registration to an npm package, exact version, and product metadata', () => {
    const onSave = vi.fn();
    render(<RegisterPluginVersionDialog categoryOptions={[]} categoriesLoading={false} categoriesError={false}
      onRetryCategories={vi.fn()} onClose={vi.fn()} onSave={onSave} saving={false} />);
    fireEvent.change(screen.getByLabelText('包名'), { target: { value: '@company/plugin' } });
    fireEvent.change(screen.getByLabelText('版本'), { target: { value: '1.2.3' } });
    expect(screen.queryByLabelText('安装目标')).toBeNull();
    expect(screen.queryByLabelText('安装方式')).toBeNull();
    expect(screen.queryByLabelText('作者')).toBeNull();
    expect(screen.queryByLabelText('源码仓库')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      packageName: '@company/plugin', version: '1.2.3',
      installation: expect.objectContaining({ spec: '@company/plugin@1.2.3' })
    }));
  });
  it('always derives the installation target from package name and version', () => {
    expect(registrationValue({ packageName: 'plugin', version: '1.0.0', spec: 'github:company/repo#main',
      repositoryUrl: 'https://github.com/company/repo' }, ['tools', ' ui ', 'tools']).installation)
      .toMatchObject({ spec: 'plugin@1.0.0', repositoryUrl: 'https://github.com/company/repo', categories: ['tools', 'ui'] });
  });
});

it('inherits metadata, locks package identity, and publishes with the chosen predecessor scope in one request', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '查看 @company/plugin 历史版本' }));
  fireEvent.click(screen.getByRole('button', { name: '基于 @company/plugin@1.0.0 新增版本' }));
  expect(screen.getByRole('dialog', { name: '新增版本' })).toBeDefined();
  expect(screen.getByLabelText('包名')).toHaveProperty('readOnly', true);
  expect(screen.getByLabelText('包名')).toHaveProperty('value', base.packageName);
  expect(screen.getByLabelText('简介')).toHaveProperty('value', base.installation.description);
  expect(screen.queryByLabelText('显示名称')).toBeNull();
  expect(screen.queryByLabelText('作者')).toBeNull();
  expect(screen.queryByLabelText('源码仓库')).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: '版本' }), { target: { value: '2.0.0' } });
  fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
  await screen.findByRole('dialog', { name: '发布插件版本' });
  expect(writes[0]?.body).toEqual({ packageName: base.packageName, version: '2.0.0', installation: { ...base.installation, spec: '@company/plugin@2.0.0' } });
  expect(screen.getByRole('combobox', { name: '可见范围' })).toHaveProperty('value', '11');
  expect(screen.getByText(/1 条可见范围/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '发布并更新范围' }));
  await waitFor(() => expect(writes[1]).toEqual({ path: '/enterprise/admin/v1/plugins/versions/13/actions/publish', revision: '0', body: { sourceVersionId: '11', packageRevision: 8 } }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(writes).toHaveLength(2);
});

it('requires a new version without dropping inherited npm metadata', () => {
  const onSave = vi.fn();
  render(<RegisterPluginVersionDialog baseVersion={base}
    versions={pluginPackage.versions} categoryOptions={[]} categoriesLoading={false} categoriesError={false}
    onRetryCategories={vi.fn()} onClose={vi.fn()} onSave={onSave} saving={false} />);
  fireEvent.change(screen.getByRole('textbox', { name: '版本' }), { target: { value: '1.1.0' } });
  fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
  expect(screen.getByRole('alert').textContent).toContain('版本已存在');
  fireEvent.change(screen.getByRole('textbox', { name: '版本' }), { target: { value: '2.0.0' } });
  fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
  expect(onSave).toHaveBeenCalledWith({ packageName: base.packageName, version: '2.0.0', installation: { ...base.installation, spec: '@company/plugin@2.0.0' } });
});

it('retains the new version draft when registration fails', async () => {
  saveFailure = true;
  show();
  fireEvent.click(await screen.findByRole('button', { name: '查看 @company/plugin 历史版本' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: /历史版本/ })).getByRole('button', { name: '基于 @company/plugin@1.1.0 新增版本' }));
  fireEvent.change(screen.getByRole('textbox', { name: '版本' }), { target: { value: '2.0.0' } });
  fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '安装目标不可用');
  expect(screen.getByRole('textbox', { name: '版本' })).toHaveProperty('value', '2.0.0');
  expect(screen.getByRole('dialog', { name: '新增版本' })).toBeDefined();
  expect(writes).toHaveLength(1);
});

it('keeps the reviewed scope and revision on a publish conflict without retrying', async () => {
  publishConflict = true;
  pluginPackage.versions.unshift({ ...base, id: '13', version: '2.0.0', status: 'VALIDATED', revision: 0 });
  show();
  fireEvent.click(await screen.findByRole('button', { name: '发布 @company/plugin@2.0.0' }));
  fireEvent.change(screen.getByRole('combobox', { name: '可见范围' }), { target: { value: '11' } });
  fireEvent.click(screen.getByRole('button', { name: '发布并更新范围' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '可见范围已被修改，请关闭后重新发布。');
  expect(screen.getByRole('combobox', { name: '可见范围' })).toHaveProperty('value', '11');
  expect(writes).toEqual([{ path: '/enterprise/admin/v1/plugins/versions/13/actions/publish', revision: '0', body: { sourceVersionId: '11', packageRevision: 7 } }]);
});

it('allows publication without moving scopes and retains the empty first-registration form', async () => {
  pluginPackage.versions.unshift({ ...base, id: '13', version: '2.0.0', status: 'VALIDATED', revision: 0 });
  show();
  fireEvent.click(await screen.findByRole('button', { name: '发布 @company/plugin@2.0.0' }));
  fireEvent.change(screen.getByRole('combobox', { name: '可见范围' }), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(writes[0]?.body).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: '添加插件' }));
  expect(screen.getByLabelText('包名')).toHaveProperty('readOnly', false);
  expect(screen.queryByLabelText('作者')).toBeNull();
});

it('does not expose version creation to read-only administrators', async () => {
  access.permissions = ['ent:plugin:read'];
  show();
  await screen.findByText('1.1.0');
  expect(screen.queryByRole('button', { name: /新增版本|添加插件|发布 @/ })).toBeNull();
});
