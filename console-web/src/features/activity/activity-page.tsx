/**
 * [INPUT]: 依赖用量、审计、Session、插件库存 operation，console 权限、TanStack Query 与产品表格/弹窗。
 * [OUTPUT]: 提供按 ent:* 权限裁剪的活动记录分段、只读事实查询、Session 正文查看和受权删除。
 * [POS]: features/activity 的产品观测工作台；Server 独占审计、正文授权、tombstone 和 cursor 裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { Eye, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  deleteAdminSession,
  listAdminSessions,
  listAuditEvents,
  listPluginInventory,
  listUsageLedger,
  readAdminSessionContent
} from '@/api/generated/sdk.gen';
import type {
  AdminPluginInventoryItem,
  AdminPluginInventoryPageData,
  AdminSession,
  AdminSessionPageData,
  AuditEvent,
  AuditEventPageData,
  EnterpriseErrorResponse,
  QuotaUsageLedgerItem,
  QuotaUsageLedgerPageData,
  SessionExport
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { decodeAdminSessionEvents } from './session-content';

const ACTIVITY_SECTIONS = [
  ['用量', 'ent:model:read'],
  ['审计', 'ent:audit:read'],
  ['Session', 'ent:session:read'],
  ['运行异常', 'ent:plugin:read']
] as const;

export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number][0];

export function activitySectionsFor(permissions: readonly string[]): ActivitySection[] {
  return ACTIVITY_SECTIONS.filter(([, permission]) => permissions.includes(permission)).map(([section]) => section);
}

export function sessionActionsFor(permissions: readonly string[]) {
  return {
    canReadContent: permissions.includes('ent:session:content:read'),
    canDelete: permissions.includes('ent:session:delete')
  };
}

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

function nextCursor(page: { page: { hasMore: boolean; nextCursor?: string | null } }) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function dateTime(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(date);
}

function tokens(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

async function loadUsage(cursor?: string) {
  return unwrapData<QuotaUsageLedgerPageData>(await listUsageLedger({ query: { cursor, limit: 100 } }), '用量读取失败');
}

async function loadAudit(cursor?: string) {
  return unwrapData<AuditEventPageData>(await listAuditEvents({ query: { cursor, limit: 100 } }), '审计读取失败');
}

async function loadSessions(cursor?: string) {
  return unwrapData<AdminSessionPageData>(await listAdminSessions({ query: { cursor, limit: 100 } }), 'Session 读取失败');
}

async function loadRuntimeErrors(cursor?: string) {
  return unwrapData<AdminPluginInventoryPageData>(await listPluginInventory({ query: { cursor, limit: 100 } }), '运行状态读取失败');
}

async function loadSessionContent(replicaId: string, fromSeq = 0) {
  const content = unwrapData<SessionExport>(await readAdminSessionContent({
    path: { replicaId }, query: { fromSeq, limit: 100 }
  }), 'Session 正文读取失败');
  return { ...content, events: decodeAdminSessionEvents(content) };
}

const usageColumns: ReadonlyArray<ProductTableColumn<QuotaUsageLedgerItem>> = [
  {
    id: 'member',
    accessorFn: (row) => `${row.userDisplayName} ${row.username}`,
    header: '成员',
    cell: ({ row }) => <div className="min-w-0"><div className="truncate font-medium">{row.original.userDisplayName}</div><div className="truncate font-mono text-[11px] text-ink-3">{row.original.username}</div></div>,
    meta: { label: '成员', className: 'w-[190px]', cellClassName: 'w-[190px]' }
  },
  {
    id: 'model', accessorFn: (row) => `${row.modelDisplayName} ${row.modelAlias}`, header: '模型',
    cell: ({ row }) => <div className="min-w-0"><div className="truncate">{row.original.modelDisplayName}</div><div className="truncate font-mono text-[11px] text-ink-3">{row.original.modelAlias}</div></div>,
    meta: { label: '模型', className: 'w-[190px]', cellClassName: 'w-[190px]' }
  },
  { accessorKey: 'inputTokens', header: '输入', cell: ({ getValue }) => tokens(Number(getValue())), meta: { label: '输入', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
  { accessorKey: 'outputTokens', header: '输出', cell: ({ getValue }) => tokens(Number(getValue())), meta: { label: '输出', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
  { accessorKey: 'cacheTokens', header: '缓存', cell: ({ getValue }) => tokens(Number(getValue())), meta: { label: '缓存', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
  { accessorKey: 'totalTokens', header: '总计', cell: ({ getValue }) => tokens(Number(getValue())), meta: { label: '总计', className: 'w-[100px]', cellClassName: 'w-[100px]' } },
  {
    accessorKey: 'result', header: '结算', filterFn: 'equalsString',
    cell: ({ getValue }) => <StatusPill tone={getValue() === 'SETTLED' ? 'green' : 'orange'}>{getValue() === 'SETTLED' ? '已结算' : '按上限'}</StatusPill>,
    meta: { label: '结算', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  },
  { id: 'createdAt', accessorFn: (row) => dateTime(row.createdAt), header: '时间', meta: { label: '时间', className: 'w-[170px]', cellClassName: 'w-[170px]' } }
];

const auditColumns: ReadonlyArray<ProductTableColumn<AuditEvent>> = [
  { id: 'occurredAt', accessorFn: (row) => dateTime(row.occurredAt), header: '时间', meta: { label: '时间', className: 'w-[170px]', cellClassName: 'w-[170px]' } },
  { accessorKey: 'action', header: '动作', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '动作', className: 'w-[210px]', cellClassName: 'w-[210px]' } },
  {
    id: 'resource', accessorFn: (row) => `${row.resourceType} ${row.resourceId}`, header: '资源',
    cell: ({ row }) => <div className="min-w-0"><div className="truncate">{row.original.resourceType}</div><div className="truncate font-mono text-[11px] text-ink-3">{row.original.resourceId}</div></div>,
    meta: { label: '资源', className: 'w-[230px]', cellClassName: 'w-[230px]' }
  },
  { id: 'actor', accessorFn: (row) => row.actorId ?? row.actorType, header: '执行者', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '执行者', className: 'w-[160px]', cellClassName: 'w-[160px]' } },
  {
    accessorKey: 'result', header: '结果', filterFn: 'equalsString',
    cell: ({ getValue }) => <StatusPill tone={getValue() === 'SUCCESS' ? 'green' : 'red'}>{getValue() === 'SUCCESS' ? '成功' : '失败'}</StatusPill>,
    meta: { label: '结果', className: 'w-[100px]', cellClassName: 'w-[100px]' }
  },
  { id: 'reason', accessorFn: (row) => row.reasonCode ?? '-', header: '原因', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '原因', className: 'w-[180px]', cellClassName: 'w-[180px]' } },
  { accessorKey: 'requestId', header: 'Request ID', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: 'Request ID', className: 'w-[190px]', cellClassName: 'w-[190px]' } }
];

const runtimeErrorColumns: ReadonlyArray<ProductTableColumn<AdminPluginInventoryItem>> = [
  { id: 'member', accessorFn: (row) => row.username, header: '成员', meta: { label: '成员', className: 'w-[160px]', cellClassName: 'w-[160px]' } },
  { accessorKey: 'packageName', header: '插件', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '插件', className: 'w-[190px]', cellClassName: 'w-[190px]' } },
  { accessorKey: 'version', header: '版本', meta: { label: '版本', className: 'w-[100px]', cellClassName: 'w-[100px]' } },
  { accessorKey: 'state', header: '状态', cell: ({ getValue }) => <StatusPill tone="red">{String(getValue())}</StatusPill>, meta: { label: '状态', className: 'w-[150px]', cellClassName: 'w-[150px]' } },
  { id: 'error', accessorFn: (row) => row.lastErrorCode ?? '-', header: '错误码', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '错误码', className: 'w-[240px]', cellClassName: 'w-[240px]' } },
  { id: 'observedAt', accessorFn: (row) => dateTime(row.observedAt), header: '上报时间', meta: { label: '上报时间', className: 'w-[170px]', cellClassName: 'w-[170px]' } }
];

function sessionColumns({
  canDelete,
  canReadContent,
  deleting,
  onDelete,
  onOpen
}: {
  canDelete: boolean;
  canReadContent: boolean;
  deleting: boolean;
  onDelete: (session: AdminSession) => void;
  onOpen: (session: AdminSession) => void;
}): ReadonlyArray<ProductTableColumn<AdminSession>> {
  return [
    { id: 'owner', accessorFn: (row) => row.ownerUsername, header: '成员', meta: { label: '成员', className: 'w-[150px]', cellClassName: 'w-[150px]' } },
    { id: 'device', accessorFn: (row) => row.sourceDeviceName, header: '设备', meta: { label: '设备', className: 'w-[170px]', cellClassName: 'w-[170px]' } },
    { accessorKey: 'sessionId', header: 'Session', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: 'Session', className: 'w-[250px]', cellClassName: 'w-[250px]' } },
    { accessorKey: 'eventCount', header: '事件数', meta: { label: '事件数', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
    { id: 'updatedAt', accessorFn: (row) => dateTime(row.updatedAt), header: '最后同步', meta: { label: '最后同步', className: 'w-[170px]', cellClassName: 'w-[170px]' } },
    {
      accessorKey: 'status', header: '状态', filterFn: 'equalsString',
      cell: ({ getValue }) => <StatusPill tone={getValue() === 'ACTIVE' ? 'green' : getValue() === 'EXPIRED' ? 'orange' : 'neutral'}>{String(getValue())}</StatusPill>,
      meta: { label: '状态', className: 'w-[110px]', cellClassName: 'w-[110px]' }
    },
    {
      id: 'actions', header: '', enableGlobalFilter: false, enableHiding: false, enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {canReadContent ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label={`查看 ${row.original.sessionId} 正文`} title="查看正文" onClick={() => onOpen(row.original)}><Eye aria-hidden className="size-3.5" /></Button> : null}
          {canDelete && row.original.status === 'ACTIVE' ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" disabled={deleting} aria-label={`删除 ${row.original.sessionId}`} title="删除" onClick={() => onDelete(row.original)}><Trash2 aria-hidden className="size-3.5" /></Button> : null}
        </div>
      ),
      meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
    }
  ];
}

function SessionContentDialog({
  error,
  events,
  hasMore,
  loading,
  loadingMore,
  onClose,
  onLoadMore,
  onRetry,
  session,
  title
}: {
  error: unknown;
  events: readonly ReturnType<typeof decodeAdminSessionEvents>[number][];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onClose: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  session: AdminSession;
  title?: string | null;
}) {
  return (
    <ProductDialog className="max-w-[760px]" title={title || session.sessionId} onClose={onClose}>
      <div className="grid gap-3 p-5">
        {loading ? <p className="m-0 text-[12.5px] text-ink-3">正在读取正文...</p> : null}
        {error ? <div role="alert" className="flex items-center justify-between gap-3 text-[12.5px] text-red"><span>{errorMessage(error, 'Session 正文读取失败')}</span><Button size="xs" onClick={onRetry}>重试</Button></div> : null}
        {!loading && !error && events.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">Session 没有事件</p> : null}
        <ol className="m-0 grid list-none gap-3 p-0">
          {events.map((event) => (
            <li key={event.seq} className="min-w-0 border-b border-line pb-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3"><span className="font-mono text-ink-2">{event.type}</span><span>seq {event.seq}</span><span>{dateTime(event.time)}</span></div>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-inset p-3 font-mono text-[11px] text-ink-2">{JSON.stringify(event.data, null, 2) ?? 'null'}</pre>
            </li>
          ))}
        </ol>
        {hasMore ? <Button size="sm" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? '加载中' : '加载更多正文'}</Button> : null}
      </div>
    </ProductDialog>
  );
}

export function ActivityPage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const sections = activitySectionsFor(bootstrap.permissions);
  const [section, setSection] = useState<ActivitySection>(sections[0] ?? '用量');
  const [selected, setSelected] = useState<AdminSession>();
  const queryClient = useQueryClient();
  const { canReadContent, canDelete } = sessionActionsFor(bootstrap.permissions);
  const usage = useInfiniteQuery({ queryKey: ['activity', 'usage'], queryFn: ({ pageParam }) => loadUsage(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === '用量' });
  const audit = useInfiniteQuery({ queryKey: ['activity', 'audit'], queryFn: ({ pageParam }) => loadAudit(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === '审计' });
  const sessions = useInfiniteQuery({ queryKey: ['activity', 'sessions'], queryFn: ({ pageParam }) => loadSessions(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === 'Session' });
  const runtimeErrors = useInfiniteQuery({ queryKey: ['activity', 'runtime-errors'], queryFn: ({ pageParam }) => loadRuntimeErrors(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === '运行异常' });
  const content = useInfiniteQuery({
    queryKey: ['activity', 'session-content', selected?.replicaId],
    queryFn: ({ pageParam }) => loadSessionContent(selected!.replicaId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.hasMore ? page.toSeq + 1 : undefined,
    enabled: selected !== undefined && canReadContent
  });
  const remove = useMutation({
    mutationFn: async (session: AdminSession) => {
      const result = await deleteAdminSession({ path: { replicaId: session.replicaId } });
      if (result.error !== undefined) throw new Error(errorMessage(result.error, 'Session 删除失败'));
      return session;
    },
    onSuccess: async (session) => {
      if (selected?.replicaId === session.replicaId) setSelected(undefined);
      await queryClient.invalidateQueries({ queryKey: ['activity', 'sessions'] });
    }
  });
  const sessionRows = useMemo(() => sessions.data?.pages.flatMap((page) => page.items) ?? [], [sessions.data]);
  const sessionTableColumns = useMemo(() => sessionColumns({
    canDelete,
    canReadContent,
    deleting: remove.isPending,
    onDelete: (session) => {
      if (window.confirm(`确认删除 Session ${session.sessionId}？删除后源设备不会自动重传。`)) remove.mutate(session);
    },
    onOpen: setSelected
  }), [canDelete, canReadContent, remove.isPending]);
  const usageRows = useMemo(() => usage.data?.pages.flatMap((page) => page.items) ?? [], [usage.data]);
  const auditRows = useMemo(() => audit.data?.pages.flatMap((page) => page.items) ?? [], [audit.data]);
  const runtimeErrorRows = useMemo(() => runtimeErrors.data?.pages.flatMap((page) => page.items)
    .filter((item) => item.state === 'FAILED' || item.lastErrorCode !== null) ?? [], [runtimeErrors.data]);
  const contentEvents = useMemo(() => content.data?.pages.flatMap((page) => page.events) ?? [], [content.data]);
  const summary = usage.data?.pages[0]?.summary;

  const table = section === '用量' ? <ProductDataTable ariaLabel="模型用量" columns={usageColumns} data={usageRows} emptyText="暂无模型用量" error={usage.error} filter={{ columnId: 'result', label: '全部结算状态', options: [{ label: '已结算', value: 'SETTLED' }, { label: '按上限', value: 'CHARGED_MAX' }] }} getRowId={(row) => row.id} hasMore={usage.hasNextPage} isLoading={usage.isLoading} isLoadingMore={usage.isFetchingNextPage} onLoadMore={() => void usage.fetchNextPage()} onRetry={() => void usage.refetch()} searchPlaceholder="搜索成员、模型或 Request ID" toolbarAction={summary ? <span className="text-[11px] text-ink-3">{tokens(summary.requests)} 次 · {tokens(summary.totalTokens)} tokens</span> : undefined} />
    : section === '审计' ? <ProductDataTable ariaLabel="审计事件" columns={auditColumns} data={auditRows} emptyText="暂无审计事件" error={audit.error} filter={{ columnId: 'result', label: '全部结果', options: [{ label: '成功', value: 'SUCCESS' }, { label: '失败', value: 'FAILURE' }] }} getRowId={(row) => row.id} hasMore={audit.hasNextPage} isLoading={audit.isLoading} isLoadingMore={audit.isFetchingNextPage} onLoadMore={() => void audit.fetchNextPage()} onRetry={() => void audit.refetch()} searchPlaceholder="搜索动作、资源、原因或 Request ID" />
      : section === 'Session' ? <ProductDataTable ariaLabel="Session" columns={sessionTableColumns} data={sessionRows} emptyText="暂无 Session" error={sessions.error ?? remove.error} filter={{ columnId: 'status', label: '全部状态', options: [{ label: '活跃', value: 'ACTIVE' }, { label: '已删除', value: 'DELETED' }, { label: '已过期', value: 'EXPIRED' }] }} getRowId={(row) => row.replicaId} hasMore={sessions.hasNextPage} isLoading={sessions.isLoading} isLoadingMore={sessions.isFetchingNextPage} onLoadMore={() => void sessions.fetchNextPage()} onRetry={() => void sessions.refetch()} searchPlaceholder="搜索成员、设备或 Session" />
        : <ProductDataTable ariaLabel="关键运行异常" columns={runtimeErrorColumns} data={runtimeErrorRows} emptyText="暂无关键运行异常" error={runtimeErrors.error} getRowId={(row) => `${row.deviceId}:${row.packageName}`} hasMore={runtimeErrors.hasNextPage} isLoading={runtimeErrors.isLoading} isLoadingMore={runtimeErrors.isFetchingNextPage} onLoadMore={() => void runtimeErrors.fetchNextPage()} onRetry={() => void runtimeErrors.refetch()} searchPlaceholder="搜索成员、插件或错误码" />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">活动记录</h1>
          {sections.length > 0 ? <SegmentedControl options={sections} value={section} onChange={setSection} /> : null}
        </header>
        {sections.length === 0 ? <p className="m-0 text-[13px] text-ink-3">当前角色没有可读取的活动数据</p> : table}
      </div>
      {selected ? <SessionContentDialog session={selected} title={content.data?.pages[0]?.title} events={contentEvents} error={content.error} loading={content.isLoading} loadingMore={content.isFetchingNextPage} hasMore={content.hasNextPage} onClose={() => setSelected(undefined)} onLoadMore={() => void content.fetchNextPage()} onRetry={() => void content.refetch()} /> : null}
    </div>
  );
}
