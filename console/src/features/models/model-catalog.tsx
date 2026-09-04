/**
 * [INPUT]: 依赖生成的 Provider/Quota/受管模型 operation、console 权限事实、TanStack Query、ProductDataTable 与模型编辑器。
 * [OUTPUT]: 提供含共享上游容量的 Provider、受管模型与模型集紧凑列表及其管理动作。
 * [POS]: features/models 的产品模型工作台；供应商容量复用 RATE 策略，页面不实现限流、模型协议、重试或上游适配。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { FlaskConical, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createManagedModel,
  createModelProvider,
  createQuotaPolicy,
  deleteQuotaPolicy,
  deleteManagedModel,
  disableManagedModel,
  disableModelProvider,
  enableManagedModel,
  enableModelProvider,
  listManagedModels,
  listModelProviders,
  listQuotaPolicies,
  testModelProvider,
  updateManagedModel,
  updateModelProvider,
  updateQuotaPolicy
} from '@/api/generated/sdk.gen';
import type {
  EnterpriseErrorResponse,
  ManagedModel,
  ManagedModelPageData,
  ManagedModelWriteRequest,
  ModelReasoningEfforts,
  Provider,
  ProviderCreateRequestWritable,
  ProviderDiscoveredModel,
  ProviderPageData,
  ProviderProbeResult,
  ProviderUpdateRequestWritable,
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
  DeleteModelDialog,
  ModelEditorDialog,
  ProviderEditorDialog,
  type ProviderCapacityInput
} from './model-editors';
import { ModelSetManagement } from './model-set-management';
import { formatTokenCapacity } from './token-capacity';

const SECTIONS = ['受管模型', '模型集', '模型提供商'] as const;
const STATUS_FILTER = {
  columnId: 'status',
  label: '全部状态',
  options: [
    { label: '启用', value: 'ACTIVE' },
    { label: '停用', value: 'DISABLED' }
  ]
} as const;

const PROVIDER_TYPES: Record<Provider['providerType'], string> = {
  DEEPSEEK_OFFICIAL: 'DeepSeek 官方',
  CUSTOM: '自定义提供商'
};

const API_PROTOCOLS: Record<Provider['apiProtocol'], string> = {
  'openai-completions': 'OpenAI Chat Completions',
  'openai-responses': 'OpenAI Responses',
  'anthropic-messages': 'Anthropic Messages'
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function unwrapData<T>(
  result: { data?: { data: T }; error?: EnterpriseErrorResponse },
  fallbackCode: string
) {
  if (result.error !== undefined || result.data === undefined) {
    throw new Error(errorMessage(result.error, fallbackCode));
  }
  return result.data.data;
}

function requireSuccess(result: { error?: EnterpriseErrorResponse }, fallbackCode: string) {
  if (result.error !== undefined) throw new Error(errorMessage(result.error, fallbackCode));
}

async function loadModels(cursor?: string) {
  const result = await listManagedModels({ query: { limit: 100, ...(cursor ? { cursor } : {}) } });
  return unwrapData<ManagedModelPageData>(result, 'ENT_MODELS_UNAVAILABLE');
}

async function loadProviders(cursor?: string) {
  const result = await listModelProviders({ query: { limit: 100, ...(cursor ? { cursor } : {}) } });
  return unwrapData<ProviderPageData>(result, 'ENT_PROVIDERS_UNAVAILABLE');
}

async function loadProviderCapacities() {
  const items: QuotaPolicy[] = [];
  let cursor: string | undefined;
  do {
    const page = unwrapData<QuotaPolicyPageData>(await listQuotaPolicies({
      query: { limit: 100, ...(cursor ? { cursor } : {}) }
    }), 'ENT_QUOTAS_UNAVAILABLE');
    items.push(...page.items.filter((policy) => policy.policyType === 'RATE' && policy.resourceType === 'PROVIDER'));
    cursor = nextCursor(page);
  } while (cursor);
  return items;
}

function nextCursor(page: { page: { hasMore: boolean; nextCursor: string | null } }) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function capacityLabel(value?: number) {
  return value === undefined ? '继承默认' : formatTokenCapacity(value);
}

function formatReasoningEfforts(value?: ModelReasoningEfforts) {
  if (value === undefined) return '未声明';
  if (value === false) return '不支持';
  const levels = Object.keys(value).filter((level) => value[level as keyof typeof value] !== undefined);
  return levels.length === 0 ? '未声明' : levels.join(', ');
}

function ModelStatus({ status }: { status: 'ACTIVE' | 'DISABLED' }) {
  return <StatusPill tone={status === 'ACTIVE' ? 'green' : 'neutral'}>{status === 'ACTIVE' ? '启用' : '停用'}</StatusPill>;
}

const modelColumns: ReadonlyArray<ProductTableColumn<ManagedModel>> = [
  {
    accessorKey: 'alias',
    header: '模型',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink" title={row.original.name ?? row.original.alias}>{row.original.name ?? row.original.alias}</div>
        <div className="truncate font-mono text-[11px] text-ink-3" title={row.original.alias}>{row.original.alias}</div>
      </div>
    ),
    meta: { label: '模型', className: 'w-[200px]', cellClassName: 'w-[200px]' }
  },
  {
    accessorKey: 'providerName',
    header: '提供商',
    meta: { label: '提供商', className: 'w-[135px]', cellClassName: 'w-[135px]' }
  },
  {
    id: 'contextWindow',
    accessorFn: (row) => capacityLabel(row.contextWindow),
    header: '上下文窗口',
    meta: { label: '上下文窗口', className: 'w-[115px]', cellClassName: 'w-[115px]' }
  },
  {
    id: 'maxTokens',
    accessorFn: (row) => capacityLabel(row.maxTokens),
    header: '最大输出 Token',
    meta: { label: '最大输出 Token', className: 'w-[130px]', cellClassName: 'w-[130px]' }
  },
  {
    id: 'reasoningEfforts',
    accessorFn: (row) => formatReasoningEfforts(row.reasoningEfforts),
    header: '推理档位',
    cell: ({ getValue }) => <span className="block truncate" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '推理档位', className: 'w-[155px]', cellClassName: 'w-[155px]' }
  },
  {
    accessorKey: 'sortOrder',
    header: '排序',
    meta: { label: '排序', className: 'w-[65px]', cellClassName: 'w-[65px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <ModelStatus status={getValue() as ManagedModel['status']} />,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
  }
];

function providerCapacityLabel(policy?: QuotaPolicy) {
  if (!policy) return '不限制';
  if (policy.status === 'DISABLED') return '已停用';
  return [policy.rpm ? `${policy.rpm} RPM` : null, policy.concurrency ? `${policy.concurrency} 并发` : null]
    .filter(Boolean).join(' / ');
}

function providerColumns(capacities: ReadonlyMap<string, QuotaPolicy>): ReadonlyArray<ProductTableColumn<Provider>> {
  return [
  {
    id: 'capacity',
    accessorFn: (row) => providerCapacityLabel(capacities.get(row.id)),
    header: '上游容量',
    meta: { label: '上游容量', className: 'w-[150px]', cellClassName: 'w-[150px]' }
  },
  {
    accessorKey: 'name',
    header: '提供商',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink" title={row.original.name}>{row.original.name}</div>
        <div className="truncate font-mono text-[11px] text-ink-3" title={row.original.providerKey}>{row.original.providerKey}</div>
      </div>
    ),
    meta: { label: '提供商', className: 'w-[180px]', cellClassName: 'w-[180px]' }
  },
  {
    id: 'providerType',
    accessorFn: (row) => PROVIDER_TYPES[row.providerType],
    header: '类型',
    meta: { label: '类型', className: 'w-[135px]', cellClassName: 'w-[135px]' }
  },
  {
    id: 'apiProtocol',
    accessorFn: (row) => API_PROTOCOLS[row.apiProtocol],
    header: 'API 协议',
    meta: { label: 'API 协议', className: 'w-[185px]', cellClassName: 'w-[185px]' }
  },
  {
    accessorKey: 'baseUrl',
    header: 'API 地址',
    cell: ({ getValue }) => <span className="block truncate font-mono text-[12px]" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: 'API 地址', className: 'w-[235px]', cellClassName: 'w-[235px]' }
  },
  {
    id: 'credentialConfigured',
    accessorFn: (row) => row.credentialConfigured ? '已配置' : '未配置',
    header: '凭据',
    meta: { label: '凭据', className: 'w-[80px]', cellClassName: 'w-[80px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <ModelStatus status={getValue() as Provider['status']} />,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
  }
  ];
}

function modelColumnsWithActions(
  canWrite: boolean,
  disabled: boolean,
  onDelete: (model: ManagedModel) => void,
  onEdit: (model: ManagedModel) => void,
  onToggle: (model: ManagedModel) => void
): ReadonlyArray<ProductTableColumn<ManagedModel>> {
  if (!canWrite) return modelColumns;
  return [...modelColumns, {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex min-w-[88px] items-center gap-0.5">
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`编辑 ${row.original.alias}`} title="编辑" onClick={() => onEdit(row.original)}>
          <Pencil aria-hidden className="size-3.5" />
        </Button>
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`${row.original.status === 'ACTIVE' ? '停用' : '启用'} ${row.original.alias}`} title={row.original.status === 'ACTIVE' ? '停用' : '启用'} onClick={() => onToggle(row.original)}>
          {row.original.status === 'ACTIVE' ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}
        </Button>
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" disabled={disabled} aria-label={`删除 ${row.original.alias}`} title="删除" onClick={() => onDelete(row.original)}>
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </div>
    ),
    meta: { label: '操作', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  }];
}

function providerColumnsWithActions(
  capacities: ReadonlyMap<string, QuotaPolicy>,
  canWrite: boolean,
  disabled: boolean,
  onEdit: (provider: Provider) => void,
  onTest: (provider: Provider) => void,
  onToggle: (provider: Provider) => void
): ReadonlyArray<ProductTableColumn<Provider>> {
  if (!canWrite) return providerColumns(capacities);
  return [...providerColumns(capacities), {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex min-w-[88px] items-center gap-0.5">
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`编辑 ${row.original.name}`} title="编辑" onClick={() => onEdit(row.original)}>
          <Pencil aria-hidden className="size-3.5" />
        </Button>
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`测试 ${row.original.name}`} title="测试连接" onClick={() => onTest(row.original)}>
          <FlaskConical aria-hidden className="size-3.5" />
        </Button>
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`${row.original.status === 'ACTIVE' ? '停用' : '启用'} ${row.original.name}`} title={row.original.status === 'ACTIVE' ? '停用' : '启用'} onClick={() => onToggle(row.original)}>
          {row.original.status === 'ACTIVE' ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}
        </Button>
      </div>
    ),
    meta: { label: '操作', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  }];
}

type ProviderSave = {
  capacity?: ProviderCapacityInput;
  current?: Provider;
  value: ProviderCreateRequestWritable | ProviderUpdateRequestWritable;
};

type ModelSave = {
  current?: ManagedModel;
  value: ManagedModelWriteRequest;
};

type ProviderAction = { action: 'test' | 'toggle'; provider: Provider };
type ModelAction = { action: 'delete' | 'toggle'; model: ManagedModel };

export function ModelCatalog() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const canWrite = bootstrap.permissions.includes('ent:model:write');
  const canReadCapacity = bootstrap.permissions.includes('ent:grant:read');
  const canManageCapacity = bootstrap.permissions.includes('ent:grant:write');
  const queryClient = useQueryClient();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('受管模型');
  const [providerEditor, setProviderEditor] = useState<'create' | Provider | null>(null);
  const [modelEditor, setModelEditor] = useState<'create' | ManagedModel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedModel | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const models = useInfiniteQuery({
    queryKey: ['models', 'catalog'],
    queryFn: ({ pageParam }) => loadModels(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000
  });
  const providers = useInfiniteQuery({
    queryKey: ['models', 'providers'],
    queryFn: ({ pageParam }) => loadProviders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000
  });
  const providerCapacities = useQuery({
    queryKey: ['models', 'provider-capacities'],
    queryFn: loadProviderCapacities,
    enabled: canReadCapacity && section === '模型提供商',
    staleTime: 30_000
  });
  const modelRows = useMemo(() => models.data?.pages.flatMap((page) => page.items) ?? [], [models.data]);
  const providerRows = useMemo(() => providers.data?.pages.flatMap((page) => page.items) ?? [], [providers.data]);
  const capacityByProvider = useMemo(() => new Map(
    (providerCapacities.data ?? []).map((policy) => [policy.resourceId!, policy])
  ), [providerCapacities.data]);

  const probeProvider = async (provider: Provider) => {
    const result = await testModelProvider({
      body: {
        baseUrl: provider.baseUrl,
        connectTimeoutMs: provider.connectTimeoutMs,
        readTimeoutMs: provider.readTimeoutMs
      },
      path: { providerId: provider.id }
    });
    return unwrapData<ProviderProbeResult>(result, 'ENT_PROVIDER_TEST_FAILED');
  };

  const saveProvider = useMutation({
    mutationFn: async ({ capacity, current, value }: ProviderSave) => {
      const result = current
        ? await updateModelProvider({
            body: value as ProviderUpdateRequestWritable,
            headers: { 'If-Match': current.revision },
            path: { providerId: current.id }
          })
        : await createModelProvider({
            body: value as ProviderCreateRequestWritable,
            headers: { 'Idempotency-Key': crypto.randomUUID() }
          });
      const saved = unwrapData<Provider>(result, 'ENT_PROVIDER_WRITE_FAILED');
      if (!capacity) return { capacityError: undefined };
      const policy = capacityByProvider.get(saved.id);
      try {
        if (capacity.rpm === null && capacity.concurrency === null) {
          if (policy) requireSuccess(await deleteQuotaPolicy({
            headers: { 'If-Match': policy.revision },
            path: { quotaId: policy.id }
          }), 'ENT_PROVIDER_CAPACITY_WRITE_FAILED');
          return { capacityError: undefined };
        }
        const body: QuotaPolicyWriteRequest = {
          name: policy?.name ?? `供应商容量 - ${saved.providerKey}`,
          policyType: 'RATE',
          subjectType: 'ORGANIZATION',
          subjectId: null,
          resourceType: 'PROVIDER',
          resourceId: saved.id,
          fiveHourTokenLimit: null,
          dailyTokenLimit: null,
          weeklyTokenLimit: null,
          monthlyTokenLimit: null,
          rpm: capacity.rpm,
          concurrency: capacity.concurrency,
          status: 'ACTIVE'
        };
        const capacityResult = policy
          ? await updateQuotaPolicy({ body, headers: { 'If-Match': policy.revision }, path: { quotaId: policy.id } })
          : await createQuotaPolicy({ body, headers: { 'Idempotency-Key': crypto.randomUUID() } });
        unwrapData<QuotaPolicy>(capacityResult, 'ENT_PROVIDER_CAPACITY_WRITE_FAILED');
        return { capacityError: undefined };
      } catch (error) {
        return { capacityError: errorMessage(error, '上游容量保存失败') };
      }
    },
    onSuccess: async (result, variables) => {
      setProviderEditor(null);
      setNotice(result.capacityError
        ? { error: true, text: `模型提供商已保存，但${result.capacityError}` }
        : { error: false, text: variables.current ? '模型提供商已更新' : '模型提供商已创建' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['models'] }),
        queryClient.invalidateQueries({ queryKey: ['access', 'quotas'] })
      ]);
    }
  });

  const saveModel = useMutation({
    mutationFn: async ({ current, value }: ModelSave) => {
      const result = current
        ? await updateManagedModel({
            body: value,
            headers: { 'If-Match': current.revision },
            path: { modelId: current.id }
          })
        : await createManagedModel({
            body: value,
            headers: { 'Idempotency-Key': crypto.randomUUID() }
          });
      unwrapData(result, 'ENT_MODEL_WRITE_FAILED');
    },
    onSuccess: async (_data, variables) => {
      setModelEditor(null);
      setNotice({ error: false, text: variables.current ? '受管模型已更新' : '受管模型已创建' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['models', 'catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['access', 'model-options'] })
      ]);
    }
  });

  const providerAction = useMutation({
    mutationFn: async ({ action, provider }: ProviderAction) => {
      if (action === 'test') return { action, probe: await probeProvider(provider) };
      const operation = provider.status === 'ACTIVE' ? disableModelProvider : enableModelProvider;
      const result = await operation({
        headers: { 'If-Match': provider.revision },
        path: { providerId: provider.id }
      });
      unwrapData(result, 'ENT_PROVIDER_STATUS_FAILED');
      return { action };
    },
    onError: (error) => setNotice({ error: true, text: errorMessage(error, '模型提供商操作失败') }),
    onSuccess: async (result) => {
      if (result.action === 'test') {
        setNotice({
          error: !result.probe!.success,
          text: `连接测试 ${result.probe!.upstreamStatus}，${result.probe!.latencyMs} ms`
        });
        return;
      }
      setNotice({ error: false, text: '模型提供商状态已更新' });
      await queryClient.invalidateQueries({ queryKey: ['models'] });
    }
  });

  const modelAction = useMutation({
    mutationFn: async ({ action, model }: ModelAction) => {
      const result = action === 'delete'
        ? await deleteManagedModel({
            headers: { 'If-Match': model.revision },
            path: { modelId: model.id }
          })
        : await (model.status === 'ACTIVE' ? disableManagedModel : enableManagedModel)({
            headers: { 'If-Match': model.revision },
            path: { modelId: model.id }
          });
      requireSuccess(result, 'ENT_MODEL_ACTION_FAILED');
    },
    onError: (error) => setNotice({ error: true, text: errorMessage(error, '受管模型操作失败') }),
    onSuccess: async (_data, variables) => {
      setDeleteTarget(null);
      setNotice({ error: false, text: variables.action === 'delete' ? '受管模型已删除' : '受管模型状态已更新' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['models', 'catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['access', 'model-options'] })
      ]);
    }
  });

  const discoverModels = async (providerId: string): Promise<ProviderDiscoveredModel[]> => {
    const provider = providerRows.find((item) => item.id === providerId);
    if (!provider) throw new Error('请选择有效的模型提供商');
    const probe = await probeProvider(provider);
    if (!probe.success) throw new Error(`连接测试 ${probe.upstreamStatus}`);
    return probe.models;
  };

  const modelTableColumns = useMemo(() => modelColumnsWithActions(
    canWrite,
    modelAction.isPending,
    setDeleteTarget,
    (model) => {
      saveModel.reset();
      setModelEditor(model);
    },
    (model) => modelAction.mutate({ action: 'toggle', model })
  ), [canWrite, modelAction.isPending]);
  const providerTableColumns = useMemo(() => providerColumnsWithActions(
    capacityByProvider,
    canWrite,
    providerAction.isPending,
    (provider) => {
      saveProvider.reset();
      setProviderEditor(provider);
    },
    (provider) => providerAction.mutate({ action: 'test', provider }),
    (provider) => providerAction.mutate({ action: 'toggle', provider })
  ), [canWrite, providerAction.isPending, capacityByProvider]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">模型</h1>
          <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />
        </header>

        {notice && section !== '模型集' ? (
          <div role={notice.error ? 'alert' : 'status'} className={notice.error ? 'rounded-lg bg-red-tint px-3 py-2 text-[12.5px] text-red' : 'rounded-lg bg-green-tint px-3 py-2 text-[12.5px] text-green'}>
            {notice.text}
          </div>
        ) : null}

        {section === '受管模型' ? (
          <ProductDataTable
            ariaLabel="受管模型"
            columns={modelTableColumns}
            data={modelRows}
            emptyText="暂无受管模型"
            error={models.error}
            filter={STATUS_FILTER}
            getRowId={(row) => row.id}
            hasMore={models.hasNextPage}
            isLoading={models.isLoading}
            isLoadingMore={models.isFetchingNextPage}
            onLoadMore={() => void models.fetchNextPage()}
            onRetry={() => void models.refetch()}
            searchPlaceholder="搜索模型"
            toolbarAction={canWrite ? (
              <Button
                variant="primary"
                size="xs"
                disabled={providers.isLoading || providerRows.length === 0}
                onClick={() => {
                  saveModel.reset();
                  setModelEditor('create');
                }}
              >
                <Plus aria-hidden className="size-3.5" />
                新建模型
              </Button>
            ) : undefined}
          />
        ) : section === '模型集' ? (
          <ModelSetManagement canWrite={canWrite} />
        ) : (
          <ProductDataTable
            key={providerCapacities.dataUpdatedAt}
            ariaLabel="模型提供商"
            columns={providerTableColumns}
            data={providerRows}
            emptyText="暂无模型提供商"
            error={providers.error ?? providerCapacities.error}
            filter={STATUS_FILTER}
            getRowId={(row) => row.id}
            hasMore={providers.hasNextPage}
            isLoading={providers.isLoading}
            isLoadingMore={providers.isFetchingNextPage}
            onLoadMore={() => void providers.fetchNextPage()}
            onRetry={() => void providers.refetch()}
            searchPlaceholder="搜索提供商"
            toolbarAction={canWrite ? (
              <Button
                variant="primary"
                size="xs"
                onClick={() => {
                  saveProvider.reset();
                  setProviderEditor('create');
                }}
              >
                <Plus aria-hidden className="size-3.5" />
                新建提供商
              </Button>
            ) : undefined}
          />
        )}
      </div>

      {providerEditor ? (
        <ProviderEditorDialog
          key={providerEditor === 'create' ? 'create' : providerEditor.id}
          canManageCapacity={canManageCapacity}
          capacity={providerEditor === 'create' ? undefined : capacityByProvider.get(providerEditor.id)}
          current={providerEditor === 'create' ? undefined : providerEditor}
          error={saveProvider.error ? errorMessage(saveProvider.error, '模型提供商保存失败') : undefined}
          saving={saveProvider.isPending}
          onClose={() => setProviderEditor(null)}
          onSave={(value, capacity) => saveProvider.mutate({
            capacity,
            current: providerEditor === 'create' ? undefined : providerEditor,
            value
          })}
        />
      ) : null}
      {modelEditor ? (
        <ModelEditorDialog
          key={modelEditor === 'create' ? 'create' : modelEditor.id}
          current={modelEditor === 'create' ? undefined : modelEditor}
          error={saveModel.error ? errorMessage(saveModel.error, '受管模型保存失败') : undefined}
          providers={providerRows}
          saving={saveModel.isPending}
          onClose={() => setModelEditor(null)}
          onDiscover={discoverModels}
          onSave={(value) => saveModel.mutate({
            current: modelEditor === 'create' ? undefined : modelEditor,
            value
          })}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteModelDialog
          error={modelAction.error ? errorMessage(modelAction.error, '受管模型删除失败') : undefined}
          label={deleteTarget.name ?? deleteTarget.alias}
          saving={modelAction.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => modelAction.mutate({ action: 'delete', model: deleteTarget })}
        />
      ) : null}
    </div>
  );
}
