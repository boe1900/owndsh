/**
 * [INPUT]: 依赖生成的授权/配额/用户组/模型集 operation、console 权限、TanStack Query、产品表格与策略编辑器。
 * [OUTPUT]: 提供模型访问、互斥 TOKEN/RATE 三视图，以及幂等/CAS 管理动作与当前 Token 窗口读取。
 * [POS]: features/access 的产品策略工作台；按 Server 策略类型分表分表单，不在浏览器计算有效规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createModelGrant,
  createQuotaPolicy,
  deleteModelGrant,
  deleteQuotaPolicy,
  getQuotaPolicyWindows,
  listAccessGroups,
  listManagedModels,
  listModelGrants,
  listModelSets,
  listQuotaPolicies,
  updateModelGrant,
  updateQuotaPolicy
} from '@/api/generated/sdk.gen';
import type {
  AccessGroup,
  AccessGroupPageData,
  EnterpriseErrorResponse,
  ManagedModel,
  ManagedModelPageData,
  ModelGrant,
  ModelGrantPageData,
  ModelGrantWriteRequest,
  ModelSet,
  ModelSetPageData,
  QuotaPolicy,
  QuotaPolicyPageData,
  QuotaPolicyWriteRequest,
  QuotaWindow
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { DeletePolicyDialog, GrantEditorDialog, QuotaEditorDialog } from './policy-editors';

const SECTIONS = ['模型访问', 'Token 配额', '速率限制'] as const;
const STATUS_FILTER = {
  columnId: 'status',
  label: '全部状态',
  options: [
    { label: '启用', value: 'ACTIVE' },
    { label: '停用', value: 'DISABLED' }
  ]
} as const;

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function unwrap<T>(result: { data?: { data: T }; error?: EnterpriseErrorResponse }, fallback: string) {
  if (result.error !== undefined || result.data === undefined) throw new Error(errorMessage(result.error, fallback));
  return result.data.data;
}

async function loadGrants(cursor?: string) {
  return unwrap<ModelGrantPageData>(await listModelGrants({
    query: { limit: 100, ...(cursor ? { cursor } : {}) }
  }), '模型授权加载失败');
}

async function loadQuotas(cursor?: string) {
  return unwrap<QuotaPolicyPageData>(await listQuotaPolicies({
    query: { limit: 100, ...(cursor ? { cursor } : {}) }
  }), '配额策略加载失败');
}

async function loadAllModels() {
  const items: ManagedModel[] = [];
  let cursor: string | undefined;
  do {
    const page = unwrap<ManagedModelPageData>(await listManagedModels({
      query: { limit: 200, ...(cursor ? { cursor } : {}) }
    }), '受管模型加载失败');
    items.push(...page.items);
    cursor = page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
  } while (cursor);
  return items;
}

async function loadAllModelSets() {
  const items: ModelSet[] = [];
  let cursor: string | undefined;
  do {
    const page = unwrap<ModelSetPageData>(await listModelSets({
      query: { limit: 200, ...(cursor ? { cursor } : {}) }
    }), '模型集加载失败');
    items.push(...page.items);
    cursor = page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
  } while (cursor);
  return items;
}

async function loadAllAccessGroups() {
  const items: AccessGroup[] = [];
  let cursor: string | undefined;
  do {
    const page = unwrap<AccessGroupPageData>(await listAccessGroups({
      query: { limit: 200, ...(cursor ? { cursor } : {}) }
    }), '用户组加载失败');
    items.push(...page.items);
    cursor = page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
  } while (cursor);
  return items;
}

function nextCursor(page: { page: { hasMore: boolean; nextCursor: string | null } }) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function limitLabel(value: number | null) {
  return value === null ? '无限制' : new Intl.NumberFormat('zh-CN').format(value);
}

function subjectLabel(value: ModelGrant | QuotaPolicy) {
  if (value.subjectType === 'ALL_MEMBERS') return '所有成员';
  if (value.subjectType === 'ORGANIZATION') return '整个组织';
  return value.subjectName ?? (value.subjectType === 'ACCESS_GROUP' ? '未知用户组' : '未知成员');
}

function subjectTypeLabel(value: ModelGrant | QuotaPolicy) {
  return {
    ALL_MEMBERS: '全员',
    ACCESS_GROUP: '用户组',
    MEMBER: '成员',
    ORGANIZATION: '组织'
  }[value.subjectType];
}

function resourceTypeLabel(value: ModelGrant | QuotaPolicy) {
  return {
    ALL_MODELS: '全部模型',
    MODEL_SET: '模型集',
    MODEL: '模型',
    PROVIDER: '模型供应商'
  }[value.resourceType];
}

function PolicyStatus({ status }: { status: 'ACTIVE' | 'DISABLED' }) {
  return <StatusPill tone={status === 'ACTIVE' ? 'green' : 'neutral'}>{status === 'ACTIVE' ? '启用' : '停用'}</StatusPill>;
}

const grantColumns: ReadonlyArray<ProductTableColumn<ModelGrant>> = [
  {
    accessorKey: 'resourceName',
    header: '资源',
    cell: ({ row }) => <div className="min-w-0"><div className="truncate font-medium" title={row.original.resourceName}>{row.original.resourceName}</div><div className="text-[11px] text-ink-3">{resourceTypeLabel(row.original)}</div></div>,
    meta: { label: '资源', className: 'w-[280px]', cellClassName: 'w-[280px]' }
  },
  {
    id: 'subject',
    accessorFn: subjectLabel,
    header: '授权对象',
    cell: ({ row, getValue }) => <div className="min-w-0"><div className="truncate" title={String(getValue())}>{String(getValue())}</div><div className="text-[11px] text-ink-3">{subjectTypeLabel(row.original)}</div></div>,
    meta: { label: '授权对象', className: 'w-[280px]', cellClassName: 'w-[280px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <PolicyStatus status={getValue() as ModelGrant['status']} />,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  }
];

const quotaBaseColumns: ReadonlyArray<ProductTableColumn<QuotaPolicy>> = [
  {
    accessorKey: 'name',
    header: '策略',
    cell: ({ getValue }) => <span className="block truncate font-medium" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '策略', className: 'w-[220px]', cellClassName: 'w-[220px]' }
  },
  {
    id: 'subject',
    accessorFn: subjectLabel,
    header: '适用对象',
    cell: ({ row, getValue }) => <div className="min-w-0"><div className="truncate" title={String(getValue())}>{String(getValue())}</div><div className="text-[11px] text-ink-3">{subjectTypeLabel(row.original)}</div></div>,
    meta: { label: '适用对象', className: 'w-[190px]', cellClassName: 'w-[190px]' }
  },
  {
    id: 'resource',
    accessorFn: (row) => row.resourceName ?? '全部模型',
    header: '资源范围',
    cell: ({ row, getValue }) => <div className="min-w-0"><div className="truncate" title={String(getValue())}>{String(getValue())}</div><div className="text-[11px] text-ink-3">{resourceTypeLabel(row.original)}</div></div>,
    meta: { label: '资源范围', className: 'w-[190px]', cellClassName: 'w-[190px]' }
  }
];

const quotaColumns: ReadonlyArray<ProductTableColumn<QuotaPolicy>> = [
  ...quotaBaseColumns,
  {
    id: 'tokenLimits',
    accessorFn: (row) => [
      `5 小时 ${limitLabel(row.fiveHourTokenLimit)}`,
      `每日 ${limitLabel(row.dailyTokenLimit)}`,
      `每周 ${limitLabel(row.weeklyTokenLimit)}`,
      `每月 ${limitLabel(row.monthlyTokenLimit)}`
    ].join(' '),
    header: 'Token 额度',
    cell: ({ row }) => <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11.5px] tabular-nums text-ink-2"><span>5 小时 {limitLabel(row.original.fiveHourTokenLimit)}</span><span>每日 {limitLabel(row.original.dailyTokenLimit)}</span><span>每周 {limitLabel(row.original.weeklyTokenLimit)}</span><span>每月 {limitLabel(row.original.monthlyTokenLimit)}</span></div>,
    meta: { label: 'Token 额度', className: 'w-[320px]', cellClassName: 'w-[320px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <PolicyStatus status={getValue() as QuotaPolicy['status']} />,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
  }
];

const rateColumns: ReadonlyArray<ProductTableColumn<QuotaPolicy>> = [
  ...quotaBaseColumns,
  { id: 'rpm', accessorFn: (row) => limitLabel(row.rpm), header: 'RPM', meta: { label: 'RPM', className: 'w-[120px]', cellClassName: 'w-[120px]' } },
  { id: 'concurrency', accessorFn: (row) => limitLabel(row.concurrency), header: '并发', meta: { label: '并发', className: 'w-[120px]', cellClassName: 'w-[120px]' } },
  quotaColumns.at(-1)!
];

function withGrantActions(columns: ReadonlyArray<ProductTableColumn<ModelGrant>>, canWrite: boolean, onEdit: (value: ModelGrant) => void, onDelete: (value: ModelGrant) => void) {
  if (!canWrite) return columns;
  return [...columns, {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => <div className="flex items-center gap-1"><Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label="编辑模型授权" title="编辑" onClick={() => onEdit(row.original)}><Pencil aria-hidden className="size-3.5" /></Button><Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label="删除模型授权" title="删除" onClick={() => onDelete(row.original)}><Trash2 aria-hidden className="size-3.5" /></Button></div>,
    meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
  } satisfies ProductTableColumn<ModelGrant>];
}

function withQuotaActions(columns: ReadonlyArray<ProductTableColumn<QuotaPolicy>>, canWrite: boolean, onEdit: (value: QuotaPolicy) => void, onDelete: (value: QuotaPolicy) => void) {
  if (!canWrite) return columns;
  return [...columns, {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => <div className="flex items-center gap-1"><Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label="编辑配额策略" title="编辑" onClick={() => onEdit(row.original)}><Pencil aria-hidden className="size-3.5" /></Button><Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label="删除配额策略" title="删除" onClick={() => onDelete(row.original)}><Trash2 aria-hidden className="size-3.5" /></Button></div>,
    meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
  } satisfies ProductTableColumn<QuotaPolicy>];
}

type DeleteTarget = { kind: 'grant'; value: ModelGrant } | { kind: 'quota'; value: QuotaPolicy };

export function AccessPolicyPage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const canWrite = bootstrap.permissions.includes('ent:grant:write');
  const queryClient = useQueryClient();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('模型访问');
  const [grantEditor, setGrantEditor] = useState<'create' | ModelGrant | null>(null);
  const [quotaEditor, setQuotaEditor] = useState<'create' | QuotaPolicy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const grants = useInfiniteQuery({
    queryKey: ['access', 'model-grants'],
    queryFn: ({ pageParam }) => loadGrants(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: section === '模型访问',
    staleTime: 30_000
  });
  const quotas = useInfiniteQuery({
    queryKey: ['access', 'quotas'],
    queryFn: ({ pageParam }) => loadQuotas(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: section !== '模型访问',
    staleTime: 30_000
  });
  const models = useQuery({ queryKey: ['access', 'model-options'], queryFn: loadAllModels, enabled: canWrite, staleTime: 30_000 });
  const modelSets = useQuery({ queryKey: ['access', 'model-sets'], queryFn: loadAllModelSets, enabled: canWrite, staleTime: 30_000 });
  const accessGroups = useQuery({ queryKey: ['access', 'access-groups'], queryFn: loadAllAccessGroups, enabled: canWrite, staleTime: 30_000 });
  const editingQuotaId = quotaEditor && quotaEditor !== 'create' ? quotaEditor.id : undefined;
  const editingQuotaType = quotaEditor && quotaEditor !== 'create'
    ? quotaEditor.policyType
    : section === 'Token 配额' ? 'TOKEN' : 'RATE';
  const quotaWindows = useQuery({
    queryKey: ['access', 'quota-windows', editingQuotaId],
    queryFn: async () => unwrap<QuotaWindow[]>(
      await getQuotaPolicyWindows({ path: { quotaId: editingQuotaId! } }),
      '当前配额用量加载失败'
    ),
    enabled: editingQuotaId !== undefined && editingQuotaType === 'TOKEN'
  });
  const saveGrant = useMutation({
    mutationFn: async ({ current, value }: { current?: ModelGrant; value: ModelGrantWriteRequest }) => unwrap(
      current
        ? await updateModelGrant({ body: value, headers: { 'If-Match': current.revision }, path: { grantId: current.id } })
        : await createModelGrant({ body: value, headers: { 'Idempotency-Key': crypto.randomUUID() } }),
      '模型授权保存失败'
    ),
    onSuccess: async () => {
      setGrantEditor(null);
      await queryClient.invalidateQueries({ queryKey: ['access', 'model-grants'] });
    }
  });
  const saveQuota = useMutation({
    mutationFn: async ({ current, value }: { current?: QuotaPolicy; value: QuotaPolicyWriteRequest }) => unwrap(
      current
        ? await updateQuotaPolicy({ body: value, headers: { 'If-Match': current.revision }, path: { quotaId: current.id } })
        : await createQuotaPolicy({ body: value, headers: { 'Idempotency-Key': crypto.randomUUID() } }),
      '配额策略保存失败'
    ),
    onSuccess: async () => {
      setQuotaEditor(null);
      await queryClient.invalidateQueries({ queryKey: ['access', 'quotas'] });
    }
  });
  const remove = useMutation({
    mutationFn: async (target: DeleteTarget) => unwrap(
      target.kind === 'grant'
        ? await deleteModelGrant({ headers: { 'If-Match': target.value.revision }, path: { grantId: target.value.id } })
        : await deleteQuotaPolicy({ headers: { 'If-Match': target.value.revision }, path: { quotaId: target.value.id } }),
      '策略删除失败'
    ),
    onSuccess: async (_data, target) => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: target.kind === 'grant' ? ['access', 'model-grants'] : ['access', 'quotas'] });
    }
  });
  const grantRows = useMemo(() => grants.data?.pages.flatMap((page) => page.items) ?? [], [grants.data]);
  const quotaRows = useMemo(() => quotas.data?.pages.flatMap((page) => page.items) ?? [], [quotas.data]);
  const visibleQuotaRows = useMemo(
    () => quotaRows.filter((policy) => policy.policyType === (section === 'Token 配额' ? 'TOKEN' : 'RATE') && policy.resourceType !== 'PROVIDER'),
    [quotaRows, section]
  );
  const optionsLoading = models.isLoading || modelSets.isLoading || accessGroups.isLoading;
  const optionsError = models.error ?? modelSets.error ?? accessGroups.error;

  const table = section === '模型访问' ? (
    <ProductDataTable
      ariaLabel="模型访问策略"
      columns={withGrantActions(grantColumns, canWrite, (value) => { saveGrant.reset(); setGrantEditor(value); }, (value) => { remove.reset(); setDeleteTarget({ kind: 'grant', value }); })}
      data={grantRows}
      emptyText="暂无模型访问策略"
      error={grants.error}
      filter={STATUS_FILTER}
      getRowId={(row) => row.id}
      hasMore={grants.hasNextPage}
      isLoading={grants.isLoading}
      isLoadingMore={grants.isFetchingNextPage}
      onLoadMore={() => void grants.fetchNextPage()}
      onRetry={() => void grants.refetch()}
      searchPlaceholder="搜索模型、模型集、用户组或成员"
      toolbarAction={canWrite ? <Button variant="primary" size="xs" disabled={optionsLoading || optionsError !== null} onClick={() => { saveGrant.reset(); setGrantEditor('create'); }}><Plus aria-hidden className="size-3.5" />新建授权</Button> : undefined}
    />
  ) : (
    <ProductDataTable
      ariaLabel={section}
      columns={withQuotaActions(section === 'Token 配额' ? quotaColumns : rateColumns, canWrite, (value) => { saveQuota.reset(); setQuotaEditor(value); }, (value) => { remove.reset(); setDeleteTarget({ kind: 'quota', value }); })}
      data={visibleQuotaRows}
      emptyText={`暂无${section}`}
      error={quotas.error}
      filter={STATUS_FILTER}
      getRowId={(row) => row.id}
      hasMore={quotas.hasNextPage}
      isLoading={quotas.isLoading}
      isLoadingMore={quotas.isFetchingNextPage}
      onLoadMore={() => void quotas.fetchNextPage()}
      onRetry={() => void quotas.refetch()}
      searchPlaceholder="搜索策略、资源或成员"
      toolbarAction={canWrite ? <Button variant="primary" size="xs" disabled={optionsLoading || optionsError !== null} onClick={() => { saveQuota.reset(); setQuotaEditor('create'); }}><Plus aria-hidden className="size-3.5" />{section === 'Token 配额' ? '新建 Token 配额' : '新建速率限制'}</Button> : undefined}
    />
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5"><h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">访问策略</h1><SegmentedControl options={SECTIONS} value={section} onChange={setSection} /></header>
        {optionsError && canWrite ? <p role="alert" className="m-0 text-[12.5px] text-red">{errorMessage(optionsError, '策略选项加载失败')}</p> : null}
        {table}
      </div>
      {grantEditor ? <GrantEditorDialog key={grantEditor === 'create' ? 'create' : grantEditor.id} current={grantEditor === 'create' ? undefined : grantEditor} error={saveGrant.error ? errorMessage(saveGrant.error, '模型授权保存失败') : undefined} accessGroups={accessGroups.data ?? []} modelSets={modelSets.data ?? []} models={models.data ?? []} saving={saveGrant.isPending} onClose={() => setGrantEditor(null)} onSave={(value) => saveGrant.mutate({ current: grantEditor === 'create' ? undefined : grantEditor, value })} /> : null}
      {quotaEditor ? <QuotaEditorDialog key={quotaEditor === 'create' ? `create-${editingQuotaType}` : quotaEditor.id} current={quotaEditor === 'create' ? undefined : quotaEditor} error={saveQuota.error ? errorMessage(saveQuota.error, '配额策略保存失败') : quotaWindows.error ? errorMessage(quotaWindows.error, '当前配额用量加载失败') : undefined} modelSets={modelSets.data ?? []} models={models.data ?? []} policyType={editingQuotaType} windows={quotaWindows.data ?? []} windowsLoading={quotaWindows.isLoading} saving={saveQuota.isPending} onClose={() => setQuotaEditor(null)} onSave={(value) => saveQuota.mutate({ current: quotaEditor === 'create' ? undefined : quotaEditor, value })} /> : null}
      {deleteTarget ? <DeletePolicyDialog error={remove.error ? errorMessage(remove.error, '策略删除失败') : undefined} label={deleteTarget.kind === 'grant' ? deleteTarget.value.resourceName : deleteTarget.value.name} saving={remove.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget)} /> : null}
    </div>
  );
}
