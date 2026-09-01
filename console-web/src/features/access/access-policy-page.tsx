/**
 * [INPUT]: 依赖生成的模型授权/配额 operation、console 权限事实、TanStack Query、ProductDataTable 与策略编辑器。
 * [OUTPUT]: 提供模型访问、使用限额和速率限制三视图及幂等/CAS 管理动作的 AccessPolicyPage。
 * [POS]: features/access 的产品策略工作台；组织/成员作用域直接来自 Server，不在前端重建授权或配额裁决。
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
  listManagedModels,
  listModelGrants,
  listQuotaPolicies,
  updateModelGrant,
  updateQuotaPolicy
} from '@/api/generated/sdk.gen';
import type {
  EnterpriseErrorResponse,
  ManagedModel,
  ModelGrant,
  ModelGrantPageData,
  ModelGrantWriteRequest,
  QuotaPolicy,
  QuotaPolicyPageData,
  QuotaPolicyWriteRequest
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import {
  ProductDataTable,
  type ProductTableColumn
} from '@/components/product/DataTable';
import {
  DeletePolicyDialog,
  GrantEditorDialog,
  QuotaEditorDialog
} from './policy-editors';

const SECTIONS = ['模型访问', '使用限额', '速率限制'] as const;
const STATUS_FILTER = {
  columnId: 'status',
  label: '全部状态',
  options: [
    { label: '启用', value: 'ACTIVE' },
    { label: '停用', value: 'DISABLED' }
  ]
} as const;

function unwrapPage<T>(result: { data?: { data: T }; error?: unknown }, fallbackCode: string) {
  if (result.error !== undefined || result.data === undefined) {
    throw result.error ?? new Error(fallbackCode);
  }
  return result.data.data;
}

async function loadGrants(cursor?: string) {
  const result = await listModelGrants({ query: { limit: 100, ...(cursor ? { cursor } : {}) } });
  return unwrapPage<ModelGrantPageData>(result, 'ENT_MODEL_GRANTS_UNAVAILABLE');
}

async function loadQuotas(cursor?: string) {
  const result = await listQuotaPolicies({ query: { limit: 100, ...(cursor ? { cursor } : {}) } });
  return unwrapPage<QuotaPolicyPageData>(result, 'ENT_QUOTAS_UNAVAILABLE');
}

async function loadModelOptions() {
  const items: ManagedModel[] = [];
  let cursor: string | undefined;
  do {
    const result = await listManagedModels({ query: { limit: 200, ...(cursor ? { cursor } : {}) } });
    const page = unwrapPage<{ items: ManagedModel[]; page: { hasMore: boolean; nextCursor: string | null } }>(
      result,
      'ENT_MODELS_UNAVAILABLE'
    );
    items.push(...page.items);
    cursor = page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
  } while (cursor);
  return items;
}

function nextCursor(page: { page: { hasMore: boolean; nextCursor: string | null } }) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function scopeLabel(subjectType: ModelGrant['subjectType'] | QuotaPolicy['subjectType']) {
  return subjectType === 'ALL_MEMBERS' || subjectType === 'ORGANIZATION' ? '组织' : '成员';
}

function subjectLabel(subjectType: ModelGrant['subjectType'] | QuotaPolicy['subjectType'], name: string | null) {
  return subjectType === 'ALL_MEMBERS' ? '所有成员' : subjectType === 'ORGANIZATION' ? '整个组织' : name ?? '未知成员';
}

function limitLabel(value: number | null) {
  return value === null ? '无限制' : new Intl.NumberFormat('zh-CN').format(value);
}

function requireWriteSuccess(result: { error?: EnterpriseErrorResponse }) {
  if (result.error !== undefined) throw new Error(result.error.error.message);
}

function PolicyStatus({ status }: { status: 'ACTIVE' | 'DISABLED' }) {
  return <StatusPill tone={status === 'ACTIVE' ? 'green' : 'neutral'}>{status === 'ACTIVE' ? '启用' : '停用'}</StatusPill>;
}

const grantColumns: ReadonlyArray<ProductTableColumn<ModelGrant>> = [
  {
    accessorKey: 'modelAlias',
    header: '模型',
    cell: ({ getValue }) => <span className="block truncate font-medium" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '模型', className: 'w-[260px]', cellClassName: 'w-[260px]' }
  },
  {
    id: 'scope',
    accessorFn: (row) => scopeLabel(row.subjectType),
    header: '作用域',
    meta: { label: '作用域', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  },
  {
    id: 'subject',
    accessorFn: (row) => subjectLabel(row.subjectType, row.subjectName),
    header: '授权对象',
    meta: { label: '授权对象', className: 'w-[260px]', cellClassName: 'w-[260px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <PolicyStatus status={getValue() as ModelGrant['status']} />,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
  }
];

const quotaColumns: ReadonlyArray<ProductTableColumn<QuotaPolicy>> = [
  {
    accessorKey: 'name',
    header: '策略',
    cell: ({ getValue }) => <span className="block truncate font-medium" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '策略', className: 'w-[220px]', cellClassName: 'w-[220px]' }
  },
  {
    id: 'scope',
    accessorFn: (row) => scopeLabel(row.subjectType),
    header: '作用域',
    meta: { label: '作用域', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  },
  {
    id: 'subject',
    accessorFn: (row) => subjectLabel(row.subjectType, row.subjectName),
    header: '对象',
    meta: { label: '对象', className: 'w-[200px]', cellClassName: 'w-[200px]' }
  },
  {
    id: 'dailyTokenLimit',
    accessorFn: (row) => limitLabel(row.dailyTokenLimit),
    header: '每日 Token',
    meta: { label: '每日 Token', className: 'w-[145px]', cellClassName: 'w-[145px]' }
  },
  {
    id: 'monthlyTokenLimit',
    accessorFn: (row) => limitLabel(row.monthlyTokenLimit),
    header: '每月 Token',
    meta: { label: '每月 Token', className: 'w-[145px]', cellClassName: 'w-[145px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <PolicyStatus status={getValue() as QuotaPolicy['status']} />,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[95px]', cellClassName: 'w-[95px]' }
  }
];

const rateColumns: ReadonlyArray<ProductTableColumn<QuotaPolicy>> = [
  ...quotaColumns.slice(0, 3),
  {
    id: 'rpm',
    accessorFn: (row) => limitLabel(row.rpm),
    header: '每分钟请求',
    meta: { label: '每分钟请求', className: 'w-[145px]', cellClassName: 'w-[145px]' }
  },
  {
    id: 'concurrency',
    accessorFn: (row) => limitLabel(row.concurrency),
    header: '并发请求',
    meta: { label: '并发请求', className: 'w-[145px]', cellClassName: 'w-[145px]' }
  },
  quotaColumns.at(-1)!
];

function grantColumnsWithActions(
  canWrite: boolean,
  onEdit: (grant: ModelGrant) => void,
  onDelete: (grant: ModelGrant) => void
): ReadonlyArray<ProductTableColumn<ModelGrant>> {
  if (!canWrite) return grantColumns;
  return [...grantColumns, {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label="编辑模型授权" title="编辑" onClick={() => onEdit(row.original)}>
          <Pencil aria-hidden className="size-3.5" />
        </Button>
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label="删除模型授权" title="删除" onClick={() => onDelete(row.original)}>
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </div>
    ),
    meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
  }];
}

function quotaColumnsWithActions(
  section: '使用限额' | '速率限制',
  canWrite: boolean,
  onEdit: (quota: QuotaPolicy) => void,
  onDelete: (quota: QuotaPolicy) => void
): ReadonlyArray<ProductTableColumn<QuotaPolicy>> {
  const columns = section === '使用限额' ? quotaColumns : rateColumns;
  if (!canWrite) return columns;
  return [...columns, {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label="编辑使用策略" title="编辑" onClick={() => onEdit(row.original)}>
          <Pencil aria-hidden className="size-3.5" />
        </Button>
        {row.original.subjectType === 'MEMBER' ? (
          <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label="删除使用策略" title="删除" onClick={() => onDelete(row.original)}>
            <Trash2 aria-hidden className="size-3.5" />
          </Button>
        ) : null}
      </div>
    ),
    meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
  }];
}

type DeleteTarget =
  | { kind: 'grant'; value: ModelGrant }
  | { kind: 'quota'; value: QuotaPolicy };

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
  const modelOptions = useQuery({
    queryKey: ['access', 'model-options'],
    queryFn: loadModelOptions,
    enabled: canWrite,
    staleTime: 30_000
  });
  const saveGrant = useMutation({
    mutationFn: async ({ current, value }: { current?: ModelGrant; value: ModelGrantWriteRequest }) => {
      const result = current
        ? await updateModelGrant({
            body: value,
            headers: { 'If-Match': current.revision },
            path: { grantId: current.id }
          })
        : await createModelGrant({
            body: value,
            headers: { 'Idempotency-Key': crypto.randomUUID() }
          });
      requireWriteSuccess(result);
    },
    onSuccess: async () => {
      setGrantEditor(null);
      await queryClient.invalidateQueries({ queryKey: ['access', 'model-grants'] });
    }
  });
  const saveQuota = useMutation({
    mutationFn: async ({ current, value }: { current?: QuotaPolicy; value: QuotaPolicyWriteRequest }) => {
      const result = current
        ? await updateQuotaPolicy({
            body: value,
            headers: { 'If-Match': current.revision },
            path: { quotaId: current.id }
          })
        : await createQuotaPolicy({
            body: value,
            headers: { 'Idempotency-Key': crypto.randomUUID() }
          });
      requireWriteSuccess(result);
    },
    onSuccess: async () => {
      setQuotaEditor(null);
      await queryClient.invalidateQueries({ queryKey: ['access', 'quotas'] });
    }
  });
  const deletePolicy = useMutation({
    mutationFn: async (target: DeleteTarget) => {
      const result = target.kind === 'grant'
        ? await deleteModelGrant({
            headers: { 'If-Match': target.value.revision },
            path: { grantId: target.value.id }
          })
        : await deleteQuotaPolicy({
            headers: { 'If-Match': target.value.revision },
            path: { quotaId: target.value.id }
          });
      requireWriteSuccess(result);
    },
    onSuccess: async (_data, target) => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({
        queryKey: target.kind === 'grant' ? ['access', 'model-grants'] : ['access', 'quotas']
      });
    }
  });
  const grantRows = useMemo(() => grants.data?.pages.flatMap((page) => page.items) ?? [], [grants.data]);
  const quotaRows = useMemo(() => quotas.data?.pages.flatMap((page) => page.items) ?? [], [quotas.data]);

  const openGrant = (grant?: ModelGrant) => {
    saveGrant.reset();
    setGrantEditor(grant ?? 'create');
  };
  const openQuota = (quota?: QuotaPolicy) => {
    saveQuota.reset();
    setQuotaEditor(quota ?? 'create');
  };
  const requestDelete = (target: DeleteTarget) => {
    deletePolicy.reset();
    setDeleteTarget(target);
  };

  const table = section === '模型访问' ? (
    <ProductDataTable
      ariaLabel="模型访问策略"
      columns={grantColumnsWithActions(
        canWrite,
        openGrant,
        (grant) => requestDelete({ kind: 'grant', value: grant })
      )}
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
      searchPlaceholder="搜索模型或成员"
      toolbarAction={canWrite ? (
        <Button variant="primary" size="xs" disabled={modelOptions.isLoading || modelOptions.isError} onClick={() => openGrant()}>
          <Plus aria-hidden className="size-3.5" />
          新建授权
        </Button>
      ) : undefined}
    />
  ) : (
    <ProductDataTable
      ariaLabel={section}
      columns={quotaColumnsWithActions(
        section,
        canWrite,
        openQuota,
        (quota) => requestDelete({ kind: 'quota', value: quota })
      )}
      data={quotaRows}
      emptyText={`暂无${section}`}
      error={quotas.error}
      filter={STATUS_FILTER}
      getRowId={(row) => row.id}
      hasMore={quotas.hasNextPage}
      isLoading={quotas.isLoading}
      isLoadingMore={quotas.isFetchingNextPage}
      onLoadMore={() => void quotas.fetchNextPage()}
      onRetry={() => void quotas.refetch()}
      searchPlaceholder="搜索策略或成员"
      toolbarAction={canWrite ? (
        <Button variant="primary" size="xs" onClick={() => openQuota()}>
          <Plus aria-hidden className="size-3.5" />
          新建策略
        </Button>
      ) : undefined}
    />
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">访问策略</h1>
          <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />
        </header>
        {table}
      </div>
      {grantEditor ? (
        <GrantEditorDialog
          key={grantEditor === 'create' ? 'create' : grantEditor.id}
          current={grantEditor === 'create' ? undefined : grantEditor}
          error={saveGrant.error?.message}
          models={modelOptions.data ?? []}
          saving={saveGrant.isPending}
          onClose={() => setGrantEditor(null)}
          onSave={(value) => saveGrant.mutate({
            current: grantEditor === 'create' ? undefined : grantEditor,
            value
          })}
        />
      ) : null}
      {quotaEditor ? (
        <QuotaEditorDialog
          key={quotaEditor === 'create' ? 'create' : quotaEditor.id}
          current={quotaEditor === 'create' ? undefined : quotaEditor}
          error={saveQuota.error?.message}
          saving={saveQuota.isPending}
          onClose={() => setQuotaEditor(null)}
          onSave={(value) => saveQuota.mutate({
            current: quotaEditor === 'create' ? undefined : quotaEditor,
            value
          })}
        />
      ) : null}
      {deleteTarget ? (
        <DeletePolicyDialog
          error={deletePolicy.error?.message}
          label={deleteTarget.kind === 'grant' ? deleteTarget.value.modelAlias : deleteTarget.value.name}
          saving={deletePolicy.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deletePolicy.mutate(deleteTarget)}
        />
      ) : null}
    </div>
  );
}
