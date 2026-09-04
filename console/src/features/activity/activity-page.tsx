/**
 * [INPUT]: 依赖用量、审计、插件库存 operation，console 权限、TanStack Query 与产品表格。
 * [OUTPUT]: 提供按 ent:* 权限裁剪的 V1 用量、审计和插件运行异常分段。
 * [POS]: features/activity 的产品观测工作台；V1 只呈现用量、审计和插件运行异常。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  listAuditEvents,
  listPluginInventory,
  listUsageLedger
} from '@/api/generated/sdk.gen';
import type {
  AdminPluginInventoryItem,
  AdminPluginInventoryPageData,
  AuditEvent,
  AuditEventPageData,
  EnterpriseErrorResponse,
  QuotaUsageLedgerItem,
  QuotaUsageLedgerPageData
} from '@/api/generated/types.gen';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';

const ACTIVITY_SECTIONS = [
  ['用量', 'ent:usage:read'],
  ['审计', 'ent:audit:read'],
  ['运行异常', 'ent:plugin:read']
] as const;

export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number][0];

export function activitySectionsFor(permissions: readonly string[]): ActivitySection[] {
  return ACTIVITY_SECTIONS.filter(([, permission]) => permissions.includes(permission)).map(([section]) => section);
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

async function loadRuntimeErrors(cursor?: string) {
  return unwrapData<AdminPluginInventoryPageData>(await listPluginInventory({ query: { cursor, limit: 100 } }), '运行状态读取失败');
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

export function ActivityPage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const sections = activitySectionsFor(bootstrap.permissions);
  const [section, setSection] = useState<ActivitySection>(sections[0] ?? '用量');
  const usage = useInfiniteQuery({ queryKey: ['activity', 'usage'], queryFn: ({ pageParam }) => loadUsage(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === '用量' });
  const audit = useInfiniteQuery({ queryKey: ['activity', 'audit'], queryFn: ({ pageParam }) => loadAudit(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === '审计' });
  const runtimeErrors = useInfiniteQuery({ queryKey: ['activity', 'runtime-errors'], queryFn: ({ pageParam }) => loadRuntimeErrors(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor, enabled: section === '运行异常' });
  const usageRows = useMemo(() => usage.data?.pages.flatMap((page) => page.items) ?? [], [usage.data]);
  const auditRows = useMemo(() => audit.data?.pages.flatMap((page) => page.items) ?? [], [audit.data]);
  const runtimeErrorRows = useMemo(() => runtimeErrors.data?.pages.flatMap((page) => page.items)
    .filter((item) => item.state === 'FAILED' || item.lastErrorCode !== null) ?? [], [runtimeErrors.data]);
  const summary = usage.data?.pages[0]?.summary;

  const table = section === '用量' ? <ProductDataTable ariaLabel="模型用量" columns={usageColumns} data={usageRows} emptyText="暂无模型用量" error={usage.error} filter={{ columnId: 'result', label: '全部结算状态', options: [{ label: '已结算', value: 'SETTLED' }, { label: '按上限', value: 'CHARGED_MAX' }] }} getRowId={(row) => row.id} hasMore={usage.hasNextPage} isLoading={usage.isLoading} isLoadingMore={usage.isFetchingNextPage} onLoadMore={() => void usage.fetchNextPage()} onRetry={() => void usage.refetch()} searchPlaceholder="搜索成员、模型或 Request ID" toolbarAction={summary ? <span className="text-[11px] text-ink-3">{tokens(summary.requests)} 次 · {tokens(summary.totalTokens)} tokens</span> : undefined} />
    : section === '审计' ? <ProductDataTable ariaLabel="审计事件" columns={auditColumns} data={auditRows} emptyText="暂无审计事件" error={audit.error} filter={{ columnId: 'result', label: '全部结果', options: [{ label: '成功', value: 'SUCCESS' }, { label: '失败', value: 'FAILURE' }] }} getRowId={(row) => row.id} hasMore={audit.hasNextPage} isLoading={audit.isLoading} isLoadingMore={audit.isFetchingNextPage} onLoadMore={() => void audit.fetchNextPage()} onRetry={() => void audit.refetch()} searchPlaceholder="搜索动作、资源、原因或 Request ID" />
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
    </div>
  );
}
