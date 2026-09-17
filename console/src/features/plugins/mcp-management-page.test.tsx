/**
 * [INPUT]: 依赖 MCP 管理页、生成 SDK、Testing Library 与 Query Client。
 * [OUTPUT]: 验证服务配置/访问授权 Tab 切换、配置创建/编辑与原值保留、OAuth URL 字段提示、固定请求头校验、revision 冲突、ALL 授权和异常响应不会触发 null.items 崩溃。
 * [POS]: MCP 管理 UI 的核心回归门禁。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import type { McpMcpAuth, McpMcpServer } from '@/api/generated/types.gen';
import { McpManagementPage } from './mcp-management-page';

const access = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock('@tanstack/react-router', () => ({ useRouteContext: () => ({ bootstrap: access }) }));
const serverId = '1903000000000000001';
let writes: unknown[];
let badPage = false;
let server: McpMcpServer;
let updates: Array<{ path: string; revision: string | null; body: unknown }>;
let updateConflict = false;
function page(items: unknown[]) { return { data: { items, page: { hasMore: false, nextCursor: null, limit: 200 } }, requestId: 'req_test' }; }

beforeEach(() => {
  access.permissions = ['ent:mcp:read', 'ent:mcp:write', 'ent:mcp:grant']; writes = []; updates = []; badPage = false; updateConflict = false; client.setConfig({ baseUrl: 'http://localhost' });
  server = { id: serverId, displayName: '设计工具', serverName: 'design_tools', description: '团队工具目录', transport: 'streamable-http', url: 'https://mcp.example.test', allowInsecureTransport: false, headers: { 'X-Apifox-Api-Version': '2026-09-16' }, status: 'ACTIVE', revision: 7, auth: { type: 'none' }, presentation: 'search', toolCallTimeoutMs: 90_000, reconnect: { enabled: false, initialDelayMs: 2_000, maxDelayMs: 60_000, maxAttempts: 3 }, createdAt: '2026-09-16T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z' };
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url); let body: unknown = page([]);
    if (request.method === 'PUT') {
      const update = await request.json();
      updates.push({ path: url.pathname, revision: request.headers.get('If-Match'), body: update });
      if (updateConflict) {
        server = { ...server, displayName: '其他人改名', revision: server.revision + 1 };
        return new Response(JSON.stringify({ error: { code: 'ENT_REVISION_CONFLICT', message: 'revision 冲突' }, requestId: 'req_test' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      server = { ...server, ...update, revision: server.revision + 1 };
      body = { data: server, requestId: 'req_test' };
    }
    else if (request.method === 'POST') { writes.push(await request.json()); body = { data: [], requestId: 'req_test' }; }
    else if (url.pathname.endsWith('/mcp-servers')) body = badPage ? { data: null } : page([server]);
    else if (url.pathname.endsWith('/mcp-grants')) body = page([]);
    else if (url.pathname.endsWith('/members') || url.pathname.endsWith('/access-groups')) body = page([]);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show() { const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={queryClient}><McpManagementPage /></QueryClientProvider>); }

it('switches between service configuration and authorization in header tabs', async () => {
  show();
  await screen.findByText('设计工具');
  expect(screen.getByRole('tab', { name: '服务配置', selected: true })).toBeDefined();
  expect(screen.getByRole('region', { name: 'MCP 服务' })).toBeDefined();
  expect(screen.queryByRole('region', { name: 'MCP 访问授权' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '仅服务搜索' } });
  fireEvent.click(screen.getByRole('tab', { name: '访问授权' }));
  expect(screen.getByRole('tab', { name: '访问授权', selected: true })).toBeDefined();
  expect(screen.getByRole('region', { name: 'MCP 访问授权' })).toBeDefined();
  expect(screen.queryByRole('region', { name: 'MCP 服务' })).toBeNull();
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  expect(screen.queryByRole('button', { name: '添加 MCP' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '服务配置' }));
  expect(screen.getByRole('region', { name: 'MCP 服务' })).toBeDefined();
  expect(screen.queryByRole('button', { name: '添加授权' })).toBeNull();
});
it('creates API Key metadata and public headers without a user secret', async () => {
  show();
  await screen.findByText('设计工具');
  fireEvent.click(screen.getByRole('button', { name: '添加 MCP' }));
  fireEvent.change(screen.getByLabelText('服务标识'), { target: { value: 'apifox' } });
  fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Apifox' } });
  fireEvent.change(screen.getByPlaceholderText('https://mcp.example.com/mcp'), { target: { value: 'https://mcp.example.test/mcp' } });
  fireEvent.change(screen.getByRole('combobox', { name: '认证方式' }), { target: { value: 'api-key' } });
  fireEvent.click(screen.getByRole('button', { name: '添加请求头' }));
  fireEvent.change(screen.getByLabelText('固定 Header 名称 1'), { target: { value: 'X-Apifox-Api-Version' } });
  fireEvent.change(screen.getByLabelText('固定 Header 值 1'), { target: { value: '2025-09-01' } });
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  await waitFor(() => expect(writes[0]).toMatchObject({ serverName: 'apifox', headers: { 'X-Apifox-Api-Version': '2025-09-01' } }));
  expect((writes[0] as { auth: unknown }).auth).toEqual({ type: 'api-key', headerName: 'Authorization' });
});
it('submits ALL authorization from the authorization dialog', async () => { access.permissions = ['ent:mcp:read', 'ent:mcp:grant']; show(); await screen.findByText('设计工具'); fireEvent.click(screen.getByRole('tab', { name: '访问授权' })); fireEvent.click(screen.getByRole('button', { name: '添加授权' })); fireEvent.change(screen.getByRole('dialog').querySelector('select') as HTMLSelectElement, { target: { value: serverId } }); fireEvent.click(screen.getByRole('button', { name: '保存授权' })); await waitFor(() => expect(writes[0]).toEqual({ items: [{ serverId, subjectType: 'ALL', subjectId: null, status: 'ACTIVE' }] })); });
it('shows a recoverable query error when the server page is null', async () => { badPage = true; show(); expect(await screen.findByText('MCP 服务加载失败')).toBeDefined(); expect(screen.getByRole('button', { name: '重试' })).toBeDefined(); });
it('does not mount MCP without read permission', () => { access.permissions = []; show(); expect(screen.getByText('没有 MCP 查看权限')).toBeDefined(); expect(screen.queryByRole('button', { name: '添加 MCP' })).toBeNull(); });

const authenticationCases: Array<{ name: string; auth: McpMcpAuth }> = [
  { name: 'none', auth: { type: 'none' } },
  { name: 'API Key', auth: { type: 'api-key', headerName: 'X-Api-Key' } },
  { name: 'OAuth public client', auth: { type: 'oauth', issuer: 'https://auth.example.test', resource: 'https://api.example.test/resource', clientId: 'existing-client', dynamicRegistration: false, scopes: ['read', 'write'], authorizationEndpoint: 'https://auth.example.test/authorize', tokenEndpoint: 'https://auth.example.test/token' } },
  { name: 'OAuth dynamic registration', auth: { type: 'oauth', issuer: 'https://auth.example.test', resource: 'https://api.example.test/resource', dynamicRegistration: true, scopes: ['read'] } }
];
it.each(['Issuer', 'Resource', 'Authorization endpoint', 'Token endpoint'])('rejects unsupported protocols for OAuth %s without sending the invalid draft', async (label) => {
  server.auth = authenticationCases[2]!.auth;
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑 设计工具' }));
  fireEvent.change(screen.getByLabelText(label), { target: { value: 'ftp://localhost:8090/mcp' } });
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', `OAuth ${label} 必须使用 HTTP 或 HTTPS 地址。`);
  expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('ftp://localhost:8090/mcp');
  expect(updates).toEqual([]);
  expect(writes).toEqual([]);
});
it('creates an HTTP OAuth configuration and defaults Resource to the HTTP MCP address', async () => {
  show();
  await screen.findByText('设计工具');
  fireEvent.click(screen.getByRole('button', { name: '添加 MCP' }));
  fireEvent.change(screen.getByLabelText('服务标识'), { target: { value: 'intranet-mcp' } });
  fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '内网 MCP' } });
  fireEvent.change(screen.getByPlaceholderText('https://mcp.example.com/mcp'), { target: { value: 'http://localhost:8090/mcp' } });
  fireEvent.change(screen.getByLabelText('认证方式'), { target: { value: 'oauth' } });
  fireEvent.change(screen.getByLabelText('Issuer'), { target: { value: 'http://auth.internal/auth' } });
  fireEvent.change(screen.getByLabelText('Public client ID'), { target: { value: 'public-client' } });
  fireEvent.change(screen.getByLabelText('Authorization endpoint'), { target: { value: 'http://auth.internal/auth/authorize' } });
  fireEvent.change(screen.getByLabelText('Token endpoint'), { target: { value: 'http://auth.internal/auth/token' } });
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  await waitFor(() => expect(writes[0]).toMatchObject({
    url: 'http://localhost:8090/mcp', allowInsecureTransport: true,
    auth: { type: 'oauth', issuer: 'http://auth.internal/auth', resource: 'http://localhost:8090/mcp', clientId: 'public-client',
      authorizationEndpoint: 'http://auth.internal/auth/authorize', tokenEndpoint: 'http://auth.internal/auth/token' }
  }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it.each(authenticationCases)('edits $name configuration without resetting existing metadata', async ({ auth }) => {
  server = { ...server, auth, allowInsecureTransport: true, url: 'http://mcp.example.test' };
  const { id, revision, status, createdAt, updatedAt, ...configuration } = server;
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑 设计工具' }));
  expect(screen.getByRole('dialog', { name: '编辑 MCP 服务' })).toBeDefined();
  expect((screen.getByLabelText('服务标识') as HTMLInputElement).value).toBe('design_tools');
  expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('设计工具');
  expect((screen.getByRole('combobox', { name: '工具加载' }) as HTMLSelectElement).value).toBe('search');
  expect((screen.getByLabelText('认证方式') as HTMLSelectElement).value).toBe(auth.type);
  if (auth.type === 'api-key') {
    expect((screen.getByLabelText('Header 名称') as HTMLInputElement).value).toBe(auth.headerName);
    expect(screen.queryByLabelText('值前缀')).toBeNull();
  }
  if (auth.type === 'oauth') {
    expect((screen.getByLabelText('Resource') as HTMLInputElement).value).toBe(auth.resource);
    expect((screen.getByLabelText('允许动态注册 public client') as HTMLInputElement).checked).toBe(auth.dynamicRegistration === true);
    expect((screen.getByLabelText('Public client ID') as HTMLInputElement).value).toBe('clientId' in auth ? auth.clientId : '');
  }
  fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '更新后的工具' } });
  fireEvent.change(screen.getByRole('combobox', { name: '工具加载' }), { target: { value: 'full' } });
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  await waitFor(() => expect(updates).toEqual([{ path: `/enterprise/admin/v1/mcp-servers/${id}`, revision: String(revision), body: { ...configuration, displayName: '更新后的工具', presentation: 'full' } }]));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('更新后的工具')).toBeDefined();
  expect(writes).toEqual([]);
});
it('keeps the edit draft on revision conflict and reloads the list without replaying the update', async () => {
  updateConflict = true;
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑 设计工具' }));
  fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '我的修改' } });
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '配置已被更新，请关闭编辑窗口后重新打开。');
  expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('我的修改');
  expect(updates).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  fireEvent.click(await screen.findByRole('button', { name: '编辑 其他人改名' }));
  expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('其他人改名');
});
it('hides configuration editing for read-only users', async () => {
  access.permissions = ['ent:mcp:read'];
  show();
  await screen.findByText('设计工具');
  expect(screen.queryByRole('button', { name: '编辑 设计工具' })).toBeNull();
  expect(screen.queryByRole('button', { name: '添加 MCP' })).toBeNull();
});

it('updates and removes fixed headers independently from the user credential declaration', async () => {
  server.auth = { type: 'api-key', headerName: 'Authorization' };
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑 设计工具' }));
  expect((screen.getByLabelText('固定 Header 名称 1') as HTMLInputElement).value).toBe('X-Apifox-Api-Version');
  fireEvent.change(screen.getByLabelText('固定 Header 值 1'), { target: { value: '2025-09-01' } });
  fireEvent.click(screen.getByRole('button', { name: '添加请求头' }));
  fireEvent.change(screen.getByLabelText('固定 Header 名称 2'), { target: { value: 'X-Client-Name' } });
  fireEvent.change(screen.getByLabelText('固定 Header 值 2'), { target: { value: 'OwnDsh' } });
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(updates[0]?.body).toMatchObject({ headers: { 'X-Apifox-Api-Version': '2025-09-01', 'X-Client-Name': 'OwnDsh' }, auth: server.auth });
  fireEvent.click(screen.getByRole('button', { name: '编辑 设计工具' }));
  fireEvent.click(screen.getByRole('button', { name: '移除固定请求头 2' }));
  fireEvent.click(screen.getByRole('button', { name: '移除固定请求头 1' }));
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  await waitFor(() => expect(updates).toHaveLength(2));
  expect(updates[1]?.body).toMatchObject({ headers: {}, auth: server.auth });
});
it.each([
  ['x-apifox-api-version', '固定请求头名称不能重复（不区分大小写）。'],
  ['aUtHoRiZaTiOn', '固定请求头不能填写认证、Cookie 或协议保留请求头。'],
  ['X-API-KEY', '固定请求头不能与 API Key 的 Header 名称重复。'],
  ['Bad Header', '固定请求头名称不合法。']
])('rejects invalid public header %s before sending configuration', async (name, error) => {
  server.auth = { type: 'api-key', headerName: 'X-Api-Key' };
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑 设计工具' }));
  fireEvent.click(screen.getByRole('button', { name: '添加请求头' }));
  fireEvent.change(screen.getByLabelText('固定 Header 名称 2'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('固定 Header 值 2'), { target: { value: 'test-value' } });
  fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', error);
  expect(updates).toEqual([]);
  expect(writes).toEqual([]);
});
