/**
 * [INPUT]: 依赖 MCP/成员/用户组生成 API、console 权限事实、TanStack Query、SegmentedControl、ProductDataTable 与 ProductDialog。
 * [OUTPUT]: 提供默认筛选启用项的 MCP 服务配置与访问授权目录；配置与授权通过统一弹窗提交，删除失败只在当前确认弹窗呈现且关闭后清理状态，编辑携带 revision 并保留未改配置，OAuth URL 和固定公共请求头提交前按字段校验，用户认证头由端侧生成。
 * [POS]: features/plugins 中独立 /mcp 路由的管理工作台，和插件版本页面共享组件但不再共享菜单或 tab；服务端只保存协议元数据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createMcpGrants, createMcpServer, deleteMcpGrant, disableMcpServer, enableMcpServer, listAccessGroups, listMcpGrants, listMcpServers, updateMcpGrant, updateMcpServer } from '@/api/generated/sdk.gen';
import type { EnterpriseErrorResponse, McpMcpAuth, McpMcpGrant, McpMcpServer, McpMcpServerCreateRequest } from '@/api/generated/types.gen';
import { randomUuid } from '@/lib/crypto';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { useMembers } from '@/features/member-select';

const SECTIONS = ['服务配置', '访问授权'] as const;
const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:opacity-55';
type Page<T> = { items: T[]; page: { hasMore: boolean; nextCursor: string | null } };
function errorMessage(error: unknown, fallback: string) { if (error && typeof error === 'object' && 'error' in error) { const payload = (error as EnterpriseErrorResponse).error; if (payload?.message) return payload.message; } return error instanceof Error && error.message ? error.message : fallback; }
async function loadDirectory<T>(request: (cursor?: string) => Promise<{ data?: { data?: Page<T> | null } | null; error?: unknown }>, fallback: string) { const items: T[] = []; let cursor: string | undefined; do { const result = await request(cursor); const page = result.data?.data; if (result.error || !page || !Array.isArray(page.items) || !page.page) throw new Error(errorMessage(result.error, fallback)); items.push(...page.items); cursor = page.page.hasMore ? page.page.nextCursor ?? undefined : undefined; } while (cursor); return items; }
function authLabel(auth?: McpMcpAuth) { return !auth ? '未配置' : auth.type === 'none' ? '无认证' : auth.type === 'api-key' ? 'API Key' : 'OAuth 2.0'; }

type ServerForm = { serverName: string; displayName: string; url: string; headers: Array<{ name: string; value: string }>; presentation: 'search' | 'full'; authType: 'none' | 'api-key' | 'oauth'; headerName: string; issuer: string; resource: string; clientId: string; dynamicRegistration: boolean; authorizationEndpoint: string; tokenEndpoint: string; scopes: string };
const emptyServerForm = (): ServerForm => ({ serverName: '', displayName: '', url: '', headers: [], presentation: 'search', authType: 'none', headerName: 'Authorization', issuer: '', resource: '', clientId: '', dynamicRegistration: false, authorizationEndpoint: '', tokenEndpoint: '', scopes: '' });

function serverForm(current?: McpMcpServer): ServerForm {
  if (!current) return emptyServerForm();
  const auth = current.auth;
  return {
    ...emptyServerForm(),
    serverName: current.serverName,
    displayName: current.displayName,
    url: current.url,
    headers: Object.entries(current.headers).map(([name, value]) => ({ name, value })),
    presentation: current.presentation,
    authType: auth.type,
    ...(auth.type === 'api-key' ? { headerName: auth.headerName } : {}),
    ...(auth.type === 'oauth' ? {
      issuer: auth.issuer,
      resource: auth.resource,
      clientId: 'clientId' in auth ? auth.clientId : '',
      dynamicRegistration: auth.dynamicRegistration === true,
      authorizationEndpoint: auth.authorizationEndpoint ?? '',
      tokenEndpoint: auth.tokenEndpoint ?? '',
      scopes: auth.scopes.join(' ')
    } : {})
  };
}

const reservedHeaders = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'mcp-session-id', 'mcp-protocol-version']);
function publicHeaders(value: ServerForm): Record<string, string> {
  if (value.headers.length > 16) throw new Error('固定请求头最多 16 项。');
  const seen = new Set<string>();
  const entries = value.headers.map((header) => {
    const name = header.name.trim(), normalized = name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error('固定请求头名称不合法。');
    if (reservedHeaders.has(normalized)) throw new Error('固定请求头不能填写认证、Cookie 或协议保留请求头。');
    if (value.authType === 'api-key' && normalized === value.headerName.trim().toLowerCase()) throw new Error('固定请求头不能与 API Key 的 Header 名称重复。');
    if (seen.has(normalized)) throw new Error('固定请求头名称不能重复（不区分大小写）。');
    seen.add(normalized);
    if (header.value.length > 1024 || /[\r\n\0]/.test(header.value)) throw new Error('固定请求头值最多 1024 字符，且不能包含换行或空字符。');
    return [name, header.value] as const;
  });
  if (entries.reduce((size, [name, content]) => size + new TextEncoder().encode(name + content).length, 0) > 8192) throw new Error('固定请求头合计不能超过 8 KiB。');
  return Object.fromEntries(entries);
}

function McpServerDialog({ current, error, onClose, onSave, saving }: { current?: McpMcpServer; error?: string; onClose: () => void; onSave: (value: ServerForm) => void; saving: boolean }) {
  const [value, setValue] = useState(() => serverForm(current)); const set = <K extends keyof ServerForm>(key: K, next: ServerForm[K]) => setValue((current) => ({ ...current, [key]: next }));
  return <ProductDialog className="max-w-[700px]" title={current ? '编辑 MCP 服务' : '添加 MCP 服务'} onClose={onClose}><form className="grid gap-5 p-5" onSubmit={(event: FormEvent) => { event.preventDefault(); onSave(value); }}>
    <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">服务标识<input autoFocus required maxLength={32} pattern={'[a-z][a-z0-9_\\-]*'} title="使用小写字母、数字、下划线和连字符" className={inputClass} value={value.serverName} onChange={(e) => set('serverName', e.target.value)} placeholder="如：team-tools" /></label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">显示名称<input required className={inputClass} value={value.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="请输入服务名称" /></label></div>
    <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Streamable HTTP 地址<input required type="url" className={inputClass} value={value.url} onChange={(e) => set('url', e.target.value)} placeholder="https://mcp.example.com/mcp" /><span className="font-normal text-[11.5px] text-ink-3">管理端只保存连接元数据，API Key/OAuth 凭据由用户端配置。</span></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">工具加载<select className={inputClass} value={value.presentation} onChange={(e) => set('presentation', e.target.value as ServerForm['presentation'])}><option value="search">按需加载（search）</option><option value="full">完整加载（full）</option></select></label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">认证方式<select className={inputClass} value={value.authType} onChange={(e) => set('authType', e.target.value as ServerForm['authType'])}><option value="none">无认证</option><option value="api-key">API Key（用户端填写）</option><option value="oauth">OAuth 2.0（用户端授权）</option></select></label></div>
    {value.authType === 'api-key' ? <fieldset className="grid gap-3 rounded-lg border border-line p-4"><legend className="px-1 text-[12.5px] font-semibold text-ink">API Key 元数据</legend><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Header 名称<input required className={inputClass} value={value.headerName} onChange={(e) => set('headerName', e.target.value)} /></label><p className="m-0 text-[12px] text-ink-3">用户在端侧填写完整认证值，按原样发送；例如 Bearer xxx 或原始 Key。</p></fieldset> : null}
    {value.authType === 'oauth' ? <fieldset className="grid gap-4 rounded-lg border border-line p-4"><legend className="px-1 text-[12.5px] font-semibold text-ink">OAuth 元数据</legend><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Issuer<input required type="url" className={inputClass} value={value.issuer} onChange={(e) => set('issuer', e.target.value)} placeholder="https://auth.example.com" /></label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Resource<input type="url" className={inputClass} value={value.resource} onChange={(e) => set('resource', e.target.value)} placeholder="留空使用 MCP 服务地址" /></label><label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2"><input type="checkbox" className="size-4 accent-accent" checked={value.dynamicRegistration} onChange={(e) => { set('dynamicRegistration', e.target.checked); if (e.target.checked) set('clientId', ''); }} />允许动态注册 public client</label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Public client ID<input required={!value.dynamicRegistration} disabled={value.dynamicRegistration} className={inputClass} value={value.clientId} onChange={(e) => set('clientId', e.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Authorization endpoint<input type="url" className={inputClass} value={value.authorizationEndpoint} onChange={(e) => set('authorizationEndpoint', e.target.value)} /></label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Token endpoint<input type="url" className={inputClass} value={value.tokenEndpoint} onChange={(e) => set('tokenEndpoint', e.target.value)} /></label></div><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Scopes（空格分隔）<input className={inputClass} value={value.scopes} onChange={(e) => set('scopes', e.target.value)} /></label></fieldset> : null}
    <fieldset className="grid gap-3 rounded-lg border border-line p-4">
      <legend className="px-1 text-[12.5px] font-semibold text-ink">固定请求头</legend>
      <p className="m-0 text-[12px] text-ink-3">填写版本号等公共参数；API Key 和用户令牌在端侧配置。</p>
      {value.headers.map((header, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px] items-center gap-2">
        <input required aria-label={`固定 Header 名称 ${index + 1}`} className={inputClass} placeholder="请求头名称" value={header.name} onChange={(e) => set('headers', value.headers.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
        <input aria-label={`固定 Header 值 ${index + 1}`} maxLength={1024} className={inputClass} placeholder="请求头值" value={header.value} onChange={(e) => set('headers', value.headers.map((item, i) => i === index ? { ...item, value: e.target.value } : item))} />
        <Button type="button" variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label={`移除固定请求头 ${index + 1}`} title="移除请求头" onClick={() => set('headers', value.headers.filter((_, i) => i !== index))}><Trash2 aria-hidden className="size-3.5" /></Button>
      </div>)}
      <Button type="button" size="xs" className="justify-self-start" disabled={value.headers.length >= 16} onClick={() => set('headers', [...value.headers, { name: '', value: '' }])}><Plus aria-hidden className="size-3.5" />添加请求头</Button>
    </fieldset>
    {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}<footer className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" size="sm" onClick={onClose}>取消</Button><Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? '保存中' : '保存服务'}</Button></footer>
  </form></ProductDialog>;
}

function McpGrantDialog({ error, groups, members, onClose, onSave, saving, servers }: { error?: string; groups: ReadonlyArray<{ id: string; name: string }>; members: ReadonlyArray<{ id: string; username: string; displayName: string; status?: string }>; onClose: () => void; onSave: (value: { serverId: string; subjectType: 'ALL' | 'USER' | 'GROUP'; subjectId: string | null }) => void; saving: boolean; servers: ReadonlyArray<McpMcpServer> }) {
  const [serverId, setServerId] = useState(''); const [subjectType, setSubjectType] = useState<'ALL' | 'USER' | 'GROUP'>('ALL'); const [subjectId, setSubjectId] = useState('');
  return <ProductDialog className="max-w-[560px]" title="添加 MCP 访问授权" onClose={onClose}><form className="grid gap-4 p-5" onSubmit={(e) => { e.preventDefault(); onSave({ serverId, subjectType, subjectId: subjectType === 'ALL' ? null : subjectId }); }}><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">MCP 服务<select autoFocus required className={inputClass} value={serverId} onChange={(e) => setServerId(e.target.value)}><option value="">选择 MCP 服务</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.displayName}</option>)}</select></label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">授权范围<select className={inputClass} value={subjectType} onChange={(e) => { setSubjectType(e.target.value as typeof subjectType); setSubjectId(''); }}><option value="ALL">所有成员</option><option value="USER" disabled={!members.length}>指定成员</option><option value="GROUP" disabled={!groups.length}>指定用户组</option></select></label>{subjectType === 'USER' ? <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">成员<select required className={inputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">选择成员</option>{members.map((member) => <option key={member.id} value={member.id} disabled={member.status === 'DISABLED'}>{member.displayName} ({member.username})</option>)}</select></label> : subjectType === 'GROUP' ? <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">用户组<select required className={inputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">选择用户组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label> : <p className="m-0 text-[12px] text-ink-3">授权将覆盖所有成员。</p>}{error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}<footer className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" size="sm" onClick={onClose}>取消</Button><Button type="submit" variant="primary" size="sm" disabled={saving || !serverId || (subjectType !== 'ALL' && !subjectId)}>{saving ? '保存中' : '保存授权'}</Button></footer></form></ProductDialog>;
}

const serverColumns: ReadonlyArray<ProductTableColumn<McpMcpServer>> = [{ accessorKey: 'displayName', header: 'MCP 服务', cell: ({ row }) => <div className="min-w-0"><div className="truncate font-medium text-ink">{row.original.displayName}</div><div className="truncate font-mono text-[11px] text-ink-3">{row.original.serverName}</div></div>, meta: { label: 'MCP 服务', className: 'w-[210px]', cellClassName: 'w-[210px]' } }, { accessorKey: 'url', header: '连接地址', cell: ({ getValue }) => <span className="block truncate font-mono text-[12px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '连接地址', className: 'w-[300px]', cellClassName: 'w-[300px]' } }, { id: 'auth', accessorFn: (row) => authLabel(row.auth), header: '认证', meta: { label: '认证', className: 'w-[110px]', cellClassName: 'w-[110px]' } }, { accessorKey: 'presentation', header: '工具加载', cell: ({ getValue }) => getValue() === 'full' ? '完整加载' : '按需加载', meta: { label: '工具加载', className: 'w-[110px]', cellClassName: 'w-[110px]' } }, { accessorKey: 'status', header: '状态', cell: ({ getValue }) => <StatusPill tone={getValue() === 'ACTIVE' ? 'green' : 'neutral'}>{getValue() === 'ACTIVE' ? '启用' : '停用'}</StatusPill>, filterFn: 'equalsString', meta: { label: '状态', className: 'w-[90px]', cellClassName: 'w-[90px]' } }];

export function McpManagementPage() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('服务配置');
  const { bootstrap } = useRouteContext({ from: '/_console' }); const canRead = bootstrap.permissions.includes('ent:mcp:read'); const canWrite = bootstrap.permissions.includes('ent:mcp:write'); const canGrant = bootstrap.permissions.includes('ent:mcp:grant'); const canReadMembers = bootstrap.permissions.includes('ent:member:read'); const queryClient = useQueryClient(); const [serverEditor, setServerEditor] = useState<'create' | McpMcpServer | null>(null); const [grantDialog, setGrantDialog] = useState(false); const [deleting, setDeleting] = useState<McpMcpGrant>();
  const servers = useQuery({ queryKey: ['mcp', 'servers'], queryFn: () => loadDirectory((cursor) => listMcpServers({ query: { limit: 200, ...(cursor ? { cursor } : {}) } }), 'MCP 服务加载失败'), enabled: canRead, staleTime: 15_000 }); const grants = useQuery({ queryKey: ['mcp', 'grants'], queryFn: () => loadDirectory((cursor) => listMcpGrants({ query: { limit: 200, ...(cursor ? { cursor } : {}) } }), 'MCP 授权加载失败'), enabled: canRead, staleTime: 15_000 }); const members = useMembers(canGrant && canReadMembers); const groups = useQuery({ queryKey: ['access-groups', 'directory'], queryFn: () => loadDirectory((cursor) => listAccessGroups({ query: { limit: 200, ...(cursor ? { cursor } : {}) } }), '用户组目录加载失败'), enabled: canGrant && canReadMembers, staleTime: 60_000 });
  const saveServer = useMutation({
    mutationFn: async ({ current, value }: { current?: McpMcpServer; value: ServerForm }) => {
      const auth: McpMcpAuth = value.authType === 'oauth' ? {
        type: 'oauth', issuer: value.issuer.trim(), resource: value.resource.trim() || value.url.trim(),
        ...(value.dynamicRegistration
          ? { dynamicRegistration: true as const }
          : { clientId: value.clientId.trim(), ...(current?.auth.type === 'oauth' && current.auth.dynamicRegistration === false ? { dynamicRegistration: false as const } : {}) }),
        scopes: value.scopes.split(/\s+/).filter(Boolean),
        ...(value.authorizationEndpoint.trim() ? { authorizationEndpoint: value.authorizationEndpoint.trim() } : {}),
        ...(value.tokenEndpoint.trim() ? { tokenEndpoint: value.tokenEndpoint.trim() } : {})
      } : value.authType === 'api-key'
        ? { type: 'api-key', headerName: value.headerName.trim() }
        : { type: 'none' };
      if (auth.type === 'oauth') {
        for (const [label, address] of [['Issuer', auth.issuer], ['Resource', auth.resource], ['Authorization endpoint', auth.authorizationEndpoint], ['Token endpoint', auth.tokenEndpoint]] as const) {
          if (address === undefined) continue;
          if (!URL.canParse(address)) throw new Error(`OAuth ${label} 不是有效的地址。`);
          const url = new URL(address);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`OAuth ${label} 必须使用 HTTP 或 HTTPS 地址。`);
          if (url.username || url.password || url.hash) throw new Error(`OAuth ${label} 不能包含用户名、密码或 URL 片段。`);
        }
      }
      const body: McpMcpServerCreateRequest = {
        serverName: value.serverName.trim(), displayName: value.displayName.trim(),
        description: current?.description ?? '', transport: 'streamable-http', url: value.url.trim(),
        allowInsecureTransport: new URL(value.url.trim()).protocol === 'http:', headers: publicHeaders(value), auth,
        toolCallTimeoutMs: current?.toolCallTimeoutMs ?? 60_000,
        reconnect: current?.reconnect ?? { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 },
        presentation: value.presentation
      };
      const result = current
        ? await updateMcpServer({ path: { id: current.id }, headers: { 'If-Match': current.revision }, body })
        : await createMcpServer({ headers: { 'Idempotency-Key': randomUuid() }, body });
      if (result.error) {
        if (result.error.error?.code === 'ENT_REVISION_CONFLICT') throw new Error('配置已被更新，请关闭编辑窗口后重新打开。');
        throw new Error(errorMessage(result.error, 'MCP 服务保存失败'));
      }
    },
    onSuccess: () => setServerEditor(null),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['mcp', 'servers'] })
  });
  const toggle = useMutation({ mutationFn: async (server: McpMcpServer) => { const action = server.status === 'ACTIVE' ? disableMcpServer : enableMcpServer; const result = await action({ path: { id: server.id }, headers: { 'If-Match': server.revision }, body: {} }); if (result.error) throw new Error(errorMessage(result.error, 'MCP 状态更新失败')); }, onSettled: () => void queryClient.invalidateQueries({ queryKey: ['mcp', 'servers'] }) }); const saveGrant = useMutation({ mutationFn: async (value: { serverId: string; subjectType: 'ALL' | 'USER' | 'GROUP'; subjectId: string | null }) => { const result = await createMcpGrants({ headers: { 'Idempotency-Key': randomUuid() }, body: { items: [{ ...value, status: 'ACTIVE' }] } }); if (result.error) throw new Error(errorMessage(result.error, 'MCP 授权失败')); }, onSuccess: async () => { setGrantDialog(false); await queryClient.invalidateQueries({ queryKey: ['mcp', 'grants'] }); } }); const changeGrant = useMutation({
    mutationFn: async ({ item, action }: { item: McpMcpGrant; action: 'enable' | 'disable' | 'delete' }) => {
      const options = { path: { id: item.id }, headers: { 'If-Match': item.revision } };
      const result = action === 'delete'
        ? await deleteMcpGrant(options)
        : await updateMcpGrant({ ...options, body: { status: action === 'enable' ? 'ACTIVE' : 'DISABLED' } });
      if (result.error) throw new Error(errorMessage(result.error, action === 'delete' ? 'MCP 授权删除失败' : 'MCP 授权更新失败'));
    },
    onSuccess: (_data, variables) => { if (variables.action === 'delete') setDeleting(undefined); },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['mcp', 'grants'] })
  });
  const closeDelete = () => {
    if (changeGrant.isPending) return;
    changeGrant.reset();
    setDeleting(undefined);
  };

  const rows = servers.data ?? [];
  const grantRows = grants.data ?? [];
  const grantColumns: ReadonlyArray<ProductTableColumn<McpMcpGrant>> = [{ id: 'server', accessorFn: (row) => rows.find((server) => server.id === row.serverId)?.displayName ?? `服务 ${row.serverId}`, header: 'MCP 服务', meta: { label: 'MCP 服务', className: 'w-[240px]', cellClassName: 'w-[240px]' } }, { id: 'subject', accessorFn: (row) => row.subjectType === 'ALL' ? '所有成员' : row.subjectType === 'USER' ? `成员：${members.data?.find((member) => member.id === row.subjectId)?.displayName ?? row.subjectId}` : `用户组：${groups.data?.find((group) => group.id === row.subjectId)?.name ?? row.subjectId}`, header: '授权对象', meta: { label: '授权对象', className: 'w-[300px]', cellClassName: 'w-[300px]' } }, { accessorKey: 'status', header: '状态', cell: ({ getValue }) => <StatusPill tone={getValue() === 'ACTIVE' ? 'green' : 'neutral'}>{getValue() === 'ACTIVE' ? '启用' : '停用'}</StatusPill>, filterFn: 'equalsString', meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' } }, ...(canGrant ? [{ id: 'actions', header: '操作', enableGlobalFilter: false, enableHiding: false, enableSorting: false, cell: ({ row }: any) => <div className="flex items-center gap-1"><Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label={`${row.original.status === 'ACTIVE' ? '停用' : '启用'}授权`} disabled={changeGrant.isPending} onClick={() => changeGrant.mutate({ item: row.original, action: row.original.status === 'ACTIVE' ? 'disable' : 'enable' })}>{row.original.status === 'ACTIVE' ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}</Button><Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label="删除授权" disabled={changeGrant.isPending} onClick={() => { changeGrant.reset(); setDeleting(row.original); }}><Trash2 className="size-3.5" /></Button></div>, meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' } }] : [])]; if (!canRead) return <p role="status" className="p-5 text-sm text-ink-3">没有 MCP 查看权限</p>;

  const serverTableColumns: ReadonlyArray<ProductTableColumn<McpMcpServer>> = canWrite ? [...serverColumns, {
    id: 'actions', header: '操作', enableGlobalFilter: false, enableHiding: false, enableSorting: false,
    cell: ({ row }) => <div className="flex items-center gap-0.5">
      <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={saveServer.isPending || toggle.isPending} aria-label={`编辑 ${row.original.displayName}`} title="编辑" onClick={() => { saveServer.reset(); setServerEditor(row.original); }}><Pencil aria-hidden className="size-3.5" /></Button>
      <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={saveServer.isPending || toggle.isPending} aria-label={`${row.original.status === 'ACTIVE' ? '停用' : '启用'} MCP 服务`} title={row.original.status === 'ACTIVE' ? '停用' : '启用'} onClick={() => toggle.mutate(row.original)}>{row.original.status === 'ACTIVE' ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}</Button>
    </div>,
    meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
  }] : serverColumns;

  return <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5"><h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">MCP</h1><SegmentedControl options={SECTIONS} value={section} onChange={setSection} /></header>
      {section === '服务配置' ? <ProductDataTable key="servers" ariaLabel="MCP 服务" columns={serverTableColumns} data={rows} emptyText="暂无 MCP 服务" error={servers.error} filter={{ columnId: 'status', defaultFilterValue: 'ACTIVE', label: '全部状态', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'DISABLED' }] }} getRowId={(row) => row.id} isLoading={servers.isLoading} onRetry={() => void servers.refetch()} searchPlaceholder="搜索 MCP 服务" toolbarAction={canWrite ? <Button variant="primary" size="xs" onClick={() => { saveServer.reset(); setServerEditor('create'); }}><Plus className="size-3.5" />添加 MCP</Button> : undefined} /> : <ProductDataTable key="grants" ariaLabel="MCP 访问授权" columns={grantColumns} data={grantRows} emptyText="暂无 MCP 访问授权" error={grants.error} filter={{ columnId: 'status', defaultFilterValue: 'ACTIVE', label: '全部状态', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'DISABLED' }] }} getRowId={(row) => row.id} isLoading={grants.isLoading} onRetry={() => void grants.refetch()} searchPlaceholder="搜索服务或授权对象" toolbarAction={canGrant ? <Button variant="primary" size="xs" onClick={() => { saveGrant.reset(); setGrantDialog(true); }}><Plus className="size-3.5" />添加授权</Button> : undefined} />}
      <p className="m-0 text-[12px] text-ink-3">API Key、OAuth access token 等用户秘密只在端侧配置和保存。</p></div>{serverEditor ? <McpServerDialog key={serverEditor === 'create' ? 'create' : serverEditor.id} current={serverEditor === 'create' ? undefined : serverEditor} error={saveServer.error?.message} onClose={() => setServerEditor(null)} onSave={(value) => saveServer.mutate({ current: serverEditor === 'create' ? undefined : serverEditor, value })} saving={saveServer.isPending} /> : null}{grantDialog ? <McpGrantDialog error={saveGrant.error?.message} groups={groups.data ?? []} members={members.data ?? []} onClose={() => setGrantDialog(false)} onSave={(value) => saveGrant.mutate(value)} saving={saveGrant.isPending} servers={rows} /> : null}{deleting ? (
      <ProductDialog title="删除 MCP 访问授权" onClose={closeDelete}>
        <div className="grid gap-5 p-5">
          <p className="m-0 text-sm text-ink-2">确认删除这条 MCP 访问授权？</p>
          {changeGrant.error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{changeGrant.error.message}</p> : null}
          <footer className="flex justify-end gap-2 border-t border-line pt-4">
            <Button size="sm" disabled={changeGrant.isPending} onClick={closeDelete}>取消</Button>
            <Button variant="primary" size="sm" className="bg-red text-white" disabled={changeGrant.isPending} onClick={() => changeGrant.mutate({ item: deleting, action: 'delete' })}>{changeGrant.isPending ? '删除中' : '确认删除'}</Button>
          </footer>
        </div>
      </ProductDialog>
    ) : null}</div>;
}
