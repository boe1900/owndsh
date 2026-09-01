/**
 * [INPUT]: 依赖身份源 operation、console bootstrap、同源 /healthz、TanStack Query 与产品表格/编辑器。
 * [OUTPUT]: 提供 OIDC/LDAP/LOCAL 设置、连接测试、启停、部署基本信息和独立可重试的服务健康状态。
 * [POS]: features/settings 的产品设置工作台；Server 独占 secret 存储、endpoint 校验、revision 和身份源状态裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { FlaskConical, Pencil, Plus, Power, PowerOff, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createIdentitySource,
  disableIdentitySource,
  enableIdentitySource,
  listIdentitySources,
  testIdentitySource,
  updateIdentitySource
} from '@/api/generated/sdk.gen';
import type {
  AuthConsoleBootstrapData,
  EnterpriseErrorResponse,
  IdentitySource,
  IdentitySourceConnection,
  IdentitySourceCreateRequestWritable,
  IdentitySourcePageData,
  IdentitySourceUpdateRequestWritable
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { IdentitySourceEditorDialog } from './identity-source-editor';

const SECTIONS = ['身份接入', '系统'] as const;

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function unwrapData<T>(result: { data?: { data: T }; error?: EnterpriseErrorResponse }, fallback: string) {
  if (result.error !== undefined || result.data === undefined) throw new Error(errorMessage(result.error, fallback));
  return result.data.data;
}

function nextCursor(page: IdentitySourcePageData) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function endpoint(source: IdentitySource) {
  return source.issuer ?? source.ldap?.url ?? '本地密码';
}

function lastTest(source: IdentitySource) {
  if (source.lastTestOk === undefined || !source.lastTestedAt) return '尚未测试';
  return `${source.lastTestOk ? '通过' : '失败'} · ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(source.lastTestedAt))}`;
}

async function loadSources(cursor?: string) {
  return unwrapData<IdentitySourcePageData>(await listIdentitySources({ query: { cursor, limit: 100 } }), '身份源读取失败');
}

export function ServiceHealth() {
  const health = useQuery({
    queryKey: ['system', 'health'],
    queryFn: async () => {
      const response = await fetch('/healthz', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`健康检查失败（HTTP ${response.status}）`);
      const payload = await response.json() as unknown;
      if (!payload || typeof payload !== 'object' || !('status' in payload) || typeof payload.status !== 'string') {
        throw new Error('健康检查返回格式不合法');
      }
      return payload.status;
    },
    retry: false,
    refetchInterval: 30_000
  });
  return (
    <section className="border-t border-line py-5" aria-label="服务健康">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">服务健康</h2>
          <p className="mb-0 mt-1 text-[12.5px] text-ink-3">同源网关与企业服务</p>
        </div>
        <div className="flex items-center gap-2">
          {health.isLoading ? <StatusPill>检查中</StatusPill> : health.error ? <StatusPill tone="red">不可用</StatusPill> : <StatusPill tone={health.data === 'UP' ? 'green' : 'red'}>{health.data}</StatusPill>}
          <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label="重新检查服务健康" title="重新检查" disabled={health.isFetching} onClick={() => void health.refetch()}><RefreshCw aria-hidden className={`size-3.5 ${health.isFetching ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>
      {health.error ? <p role="alert" className="mb-0 mt-3 text-[12.5px] text-red">{errorMessage(health.error, '服务健康检查失败')}</p> : null}
    </section>
  );
}

function SystemSettings({ bootstrap }: { bootstrap: AuthConsoleBootstrapData }) {
  return (
    <div className="max-w-[760px]">
      <section className="py-1" aria-label="系统基本信息">
        <h2 className="m-0 text-[14px] font-semibold text-ink">系统基本信息</h2>
        <dl className="mt-3 divide-y divide-line border-y border-line text-[12.5px]">
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3"><dt className="text-ink-3">部署名称</dt><dd className="m-0 truncate text-ink">{bootstrap.deployment.name}</dd></div>
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3"><dt className="text-ink-3">当前成员</dt><dd className="m-0 truncate text-ink">{bootstrap.member.displayName}</dd></div>
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3"><dt className="text-ink-3">固定角色</dt><dd className="m-0 break-words font-mono text-[11px] text-ink">{bootstrap.roles.join(', ')}</dd></div>
        </dl>
      </section>
      <ServiceHealth />
    </div>
  );
}

export function SettingsPage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('身份接入');
  const [editor, setEditor] = useState<IdentitySource | 'new'>();
  const [notice, setNotice] = useState<string>();
  const canWrite = bootstrap.permissions.includes('ent:identity:write');
  const queryClient = useQueryClient();
  const sources = useInfiniteQuery({ queryKey: ['settings', 'identity-sources'], queryFn: ({ pageParam }) => loadSources(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === '身份接入' });
  const rows = useMemo(() => sources.data?.pages.flatMap((page) => page.items) ?? [], [sources.data]);
  const save = useMutation({
    mutationFn: async ({ current, value }: { current?: IdentitySource; value: IdentitySourceCreateRequestWritable | IdentitySourceUpdateRequestWritable }) => current
      ? unwrapData<IdentitySource>(await updateIdentitySource({ body: value, headers: { 'If-Match': current.revision }, path: { sourceId: current.id } }), '身份源更新失败')
      : unwrapData<IdentitySource>(await createIdentitySource({ body: value as IdentitySourceCreateRequestWritable, headers: { 'Idempotency-Key': crypto.randomUUID() } }), '身份源创建失败'),
    onSuccess: async (source) => {
      setEditor(undefined);
      setNotice(`${source.name} 已保存`);
      await queryClient.invalidateQueries({ queryKey: ['settings', 'identity-sources'] });
    }
  });
  const test = useMutation({
    mutationFn: async (source: IdentitySource) => ({ source, result: unwrapData<IdentitySourceConnection>(await testIdentitySource({ path: { sourceId: source.id } }), '连接测试失败') }),
    onSuccess: async ({ source, result }) => {
      setNotice(`${source.name}：${result.diagnostic}`);
      await queryClient.invalidateQueries({ queryKey: ['settings', 'identity-sources'] });
    }
  });
  const toggle = useMutation({
    mutationFn: async (source: IdentitySource) => unwrapData<IdentitySource>(await (source.status === 'ACTIVE' ? disableIdentitySource : enableIdentitySource)({ headers: { 'If-Match': source.revision }, path: { sourceId: source.id } }), '身份源状态更新失败'),
    onSuccess: async (source) => {
      setNotice(`${source.name} 已${source.status === 'ACTIVE' ? '启用' : '停用'}`);
      await queryClient.invalidateQueries({ queryKey: ['settings', 'identity-sources'] });
    }
  });
  const columns = useMemo<ReadonlyArray<ProductTableColumn<IdentitySource>>>(() => [
    { accessorKey: 'name', header: '名称', meta: { label: '名称', className: 'w-[180px]', cellClassName: 'w-[180px]' } },
    { accessorKey: 'type', header: '类型', meta: { label: '类型', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
    { accessorKey: 'provisioningMode', header: '首次登录', cell: ({ getValue }) => getValue() === 'JIT' ? 'JIT 自动创建' : '仅绑定', meta: { label: '首次登录', className: 'w-[130px]', cellClassName: 'w-[130px]' } },
    { id: 'endpoint', accessorFn: endpoint, header: '端点', cell: ({ getValue }) => <span className="block truncate" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '端点', className: 'w-[240px]', cellClassName: 'w-[240px]' } },
    { id: 'secret', accessorFn: (source) => source.secretConfigured ? '已配置' : '未配置', header: '密钥', meta: { label: '密钥', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
    { id: 'lastTest', accessorFn: lastTest, header: '最近测试', cell: ({ row, getValue }) => <span className={row.original.lastTestOk === false ? 'text-red' : ''}>{String(getValue())}</span>, meta: { label: '最近测试', className: 'w-[180px]', cellClassName: 'w-[180px]' } },
    { accessorKey: 'status', header: '状态', filterFn: 'equalsString', cell: ({ getValue }) => <StatusPill tone={getValue() === 'ACTIVE' ? 'green' : 'neutral'}>{getValue() === 'ACTIVE' ? '启用' : '停用'}</StatusPill>, meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' } },
    {
      id: 'actions', header: '', enableGlobalFilter: false, enableHiding: false, enableSorting: false,
      cell: ({ row }) => canWrite ? <div className="flex items-center justify-end gap-1">
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label={`编辑 ${row.original.name}`} title="编辑" onClick={() => { save.reset(); setEditor(row.original); }}><Pencil aria-hidden className="size-3.5" /></Button>
        {row.original.type !== 'LOCAL' ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={test.isPending} aria-label={`测试 ${row.original.name}`} title="连接测试" onClick={() => test.mutate(row.original)}><FlaskConical aria-hidden className="size-3.5" /></Button> : null}
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={toggle.isPending} aria-label={`${row.original.status === 'ACTIVE' ? '停用' : '启用'} ${row.original.name}`} title={row.original.status === 'ACTIVE' ? '停用' : '启用'} onClick={() => { if (row.original.status !== 'ACTIVE' || window.confirm(`确认停用 ${row.original.name}？`)) toggle.mutate(row.original); }}>{row.original.status === 'ACTIVE' ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}</Button>
      </div> : null,
      meta: { label: '操作', className: 'w-[120px]', cellClassName: 'w-[120px]' }
    }
  ], [canWrite, test.isPending, toggle.isPending]);
  const mutationError = test.error ?? toggle.error;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5"><h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">设置</h1><SegmentedControl options={SECTIONS} value={section} onChange={setSection} /></header>
        {notice ? <div role="status" className="rounded-lg bg-green-tint px-3 py-2 text-[12.5px] text-green">{notice}</div> : null}
        {mutationError ? <p role="alert" className="m-0 text-[12.5px] text-red">{errorMessage(mutationError, '身份源操作失败')}</p> : null}
        {section === '身份接入' ? <ProductDataTable ariaLabel="身份源" columns={columns} data={rows} emptyText="暂无身份源" error={sources.error} filter={{ columnId: 'status', label: '全部状态', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'DISABLED' }] }} getRowId={(row) => row.id} hasMore={sources.hasNextPage} isLoading={sources.isLoading} isLoadingMore={sources.isFetchingNextPage} onLoadMore={() => void sources.fetchNextPage()} onRetry={() => void sources.refetch()} searchPlaceholder="搜索名称、类型或端点" toolbarAction={canWrite ? <Button variant="primary" size="xs" onClick={() => { save.reset(); setEditor('new'); }}><Plus aria-hidden className="size-3.5" />新建身份源</Button> : undefined} /> : <SystemSettings bootstrap={bootstrap} />}
      </div>
      {editor ? <IdentitySourceEditorDialog current={editor === 'new' ? undefined : editor} error={save.error ? errorMessage(save.error, '身份源保存失败') : undefined} saving={save.isPending} onClose={() => setEditor(undefined)} onSave={(value) => save.mutate({ current: editor === 'new' ? undefined : editor, value })} /> : null}
    </div>
  );
}
