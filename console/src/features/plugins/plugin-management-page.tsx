/**
 * [INPUT]: 依赖生成的插件管理 operation、JSON 安装配置、成员目录、console 权限事实、TanStack Query、ProductDataTable 与插件编辑器，共享 lib/crypto 生成 HTTP/HTTPS 通用幂等键。
 * [OUTPUT]: 提供插件版本/范围/设备三视图；从已有版本继承配置，保存后衔接发布确认，以版本与包 revision 原子发布并更新范围。
 * [POS]: features/plugins 的产品插件工作台；服务端负责目录、状态机和分配裁决，宿主负责包安装及依赖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { Archive, Send, Settings2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  listPluginInventory,
  listPluginPackages,
  publishPluginVersion,
  replacePluginAssignments,
  retirePluginVersion,
  registerPluginVersion
} from '@/api/generated/sdk.gen';
import type {
  AdminPluginInventoryItem,
  AdminPluginInventoryPageData,
  EnterpriseErrorResponse,
  PluginAssignment,
  PluginPackage,
  PluginPackagePageData,
  PluginPublishRequest,
  PluginVersion
} from '@/api/generated/types.gen';
import { randomUuid } from '@/lib/crypto';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { useMembers } from '@/features/member-select';
import {
  PluginAssignmentDialog,
  RetirePluginVersionDialog,
  RegisterPluginVersionDialog,
  PublishPluginVersionDialog,
  type PluginAssignmentValue,
  type PluginRegistrationValue
} from './plugin-editors';

const SECTIONS = ['插件版本', '可见范围', '设备状态'] as const;

type PluginVersionRow = PluginVersion & {
  displayName: string;
  packageRevision: number;
};

type PluginAssignmentRow = PluginAssignment & {
  displayName: string;
  packageName: string;
  subjectName: string;
  version: string;
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function unwrapData<T>(result: { data?: { data: T }; error?: EnterpriseErrorResponse }, fallback: string) {
  if (result.error !== undefined || result.data === undefined) throw new Error(errorMessage(result.error, fallback));
  return result.data.data;
}

function requireSuccess(result: { error?: EnterpriseErrorResponse }, fallback: string) {
  if (result.error !== undefined) throw new Error(errorMessage(result.error, fallback));
}

async function loadPackages(cursor?: string) {
  const result = await listPluginPackages({ query: { limit: 100, ...(cursor ? { cursor } : {}) } });
  return unwrapData<PluginPackagePageData>(result, 'ENT_PLUGIN_CATALOG_UNAVAILABLE');
}

async function loadInventory(cursor?: string) {
  const result = await listPluginInventory({ query: { limit: 100, ...(cursor ? { cursor } : {}) } });
  return unwrapData<AdminPluginInventoryPageData>(result, 'ENT_PLUGIN_INVENTORY_UNAVAILABLE');
}

function nextCursor(page: { page: { hasMore: boolean; nextCursor: string | null } }) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const VERSION_STATUS = {
  VALIDATED: { label: '待发布', tone: 'accent' },
  PUBLISHED: { label: '已发布', tone: 'green' },
  RETIRED: { label: '已退休', tone: 'neutral' }
} as const;

const DEVICE_STATUS: Record<AdminPluginInventoryItem['state'], { label: string; tone: 'accent' | 'green' | 'neutral' | 'orange' | 'red' }> = {
  EXPECTED: { label: '等待处理', tone: 'neutral' },
  INSTALLING: { label: '安装中', tone: 'accent' },
  RESTART_REQUIRED: { label: '需要重启', tone: 'orange' },
  ACTIVE: { label: '正常', tone: 'green' },
  REMOVE_PENDING: { label: '等待移除', tone: 'neutral' },
  REMOVING: { label: '移除中', tone: 'accent' },
  FAILED: { label: '失败', tone: 'red' },
  ROLLBACK: { label: '回滚中', tone: 'orange' }
};

const VERSION_FILTER = {
  columnId: 'status',
  label: '全部状态',
  options: Object.entries(VERSION_STATUS).map(([value, item]) => ({ label: item.label, value }))
};

const DEVICE_FILTER = {
  columnId: 'state',
  label: '全部状态',
  options: Object.entries(DEVICE_STATUS).map(([value, item]) => ({ label: item.label, value }))
};

function VersionStatus({ status }: { status: PluginVersion['status'] }) {
  const item = VERSION_STATUS[status];
  return <StatusPill tone={item.tone}>{item.label}</StatusPill>;
}

const versionColumns: ReadonlyArray<ProductTableColumn<PluginVersionRow>> = [
  {
    accessorKey: 'displayName',
    header: '插件',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink" title={row.original.displayName}>{row.original.displayName}</div>
        <div className="truncate font-mono text-[11px] text-ink-3" title={row.original.packageName}>{row.original.packageName}</div>
      </div>
    ),
    meta: { label: '插件', className: 'w-[220px]', cellClassName: 'w-[220px]' }
  },
  { accessorKey: 'version', header: '版本', meta: { label: '版本', className: 'w-[110px]', cellClassName: 'w-[110px]' } },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <VersionStatus status={getValue() as PluginVersion['status']} />,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[105px]', cellClassName: 'w-[105px]' }
  },
  {
    id: 'installation',
    accessorFn: (row) => row.installation.spec,
    header: '安装地址',
    cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '安装地址', className: 'w-[240px]', cellClassName: 'w-[240px]' }
  },
  {
    id: 'categories',
    accessorFn: (row) => row.installation.categories.join(' / ') || '未分类',
    header: '分类',
    meta: { label: '分类', className: 'w-[140px]', cellClassName: 'w-[140px]' }
  },
  {
    id: 'createdAt',
    accessorFn: (row) => formatDate(row.createdAt),
    header: '添加时间',
    meta: { label: '添加时间', className: 'w-[160px]', cellClassName: 'w-[160px]' }
  }
];

function versionColumnsWithActions(
  canWrite: boolean,
  disabled: boolean,
  onPublish: (version: PluginVersion) => void,
  onRetire: (version: PluginVersion) => void,
  onNewVersion: (version: PluginVersion) => void
): ReadonlyArray<ProductTableColumn<PluginVersionRow>> {
  if (!canWrite) return versionColumns;
  return [...versionColumns, {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => <div className="flex items-center gap-1">
      <Button variant="quiet" size="xs" className="h-7 gap-1 rounded-md px-2" disabled={disabled}
        aria-label={`基于 ${row.original.packageName}@${row.original.version} 新增版本`} onClick={() => onNewVersion(row.original)}>
        <Plus aria-hidden className="size-3.5" />新增版本
      </Button>
      {row.original.status === 'VALIDATED' ? (
      <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`发布 ${row.original.packageName}@${row.original.version}`} title="发布" onClick={() => onPublish(row.original)}>
        <Send aria-hidden className="size-3.5" />
      </Button>
    ) : row.original.status === 'PUBLISHED' ? (
      <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`退休 ${row.original.packageName}@${row.original.version}`} title="退休" onClick={() => onRetire(row.original)}>
        <Archive aria-hidden className="size-3.5" />
      </Button>
    ) : null}</div>,
    meta: { label: '操作', className: 'w-[145px]', cellClassName: 'w-[145px]' }
  }];
}

const assignmentColumns: ReadonlyArray<ProductTableColumn<PluginAssignmentRow>> = [
  {
    accessorKey: 'displayName',
    header: '插件',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{row.original.displayName}</div>
        <div className="truncate font-mono text-[11px] text-ink-3">{row.original.packageName}</div>
      </div>
    ),
    meta: { label: '插件', className: 'w-[220px]', cellClassName: 'w-[220px]' }
  },
  { accessorKey: 'version', header: '版本', meta: { label: '版本', className: 'w-[110px]', cellClassName: 'w-[110px]' } },
  {
    accessorKey: 'subjectName',
    header: '可见成员',
    meta: { label: '可见成员', className: 'w-[220px]', cellClassName: 'w-[220px]' }
  },
  {
    id: 'desiredState',
    accessorFn: (row) => row.desiredState === 'INSTALLED' ? '可选安装' : '已撤回',
    header: '可用状态',
    meta: { label: '可用状态', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => <StatusPill tone={getValue() === 'ACTIVE' ? 'green' : 'neutral'}>{getValue() === 'ACTIVE' ? '启用' : '停用'}</StatusPill>,
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
  }
];

const inventoryColumns: ReadonlyArray<ProductTableColumn<AdminPluginInventoryItem>> = [
  {
    accessorKey: 'username',
    header: '设备成员',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{row.original.username}</div>
        <div className="truncate font-mono text-[11px] text-ink-3" title={row.original.deviceId}>{row.original.deviceId}</div>
      </div>
    ),
    meta: { label: '设备成员', className: 'w-[190px]', cellClassName: 'w-[190px]' }
  },
  { accessorKey: 'packageName', header: '插件', meta: { label: '插件', className: 'w-[210px]', cellClassName: 'w-[210px]' } },
  {
    id: 'version',
    accessorFn: (row) => row.version ?? '未安装',
    header: '本地版本',
    meta: { label: '本地版本', className: 'w-[115px]', cellClassName: 'w-[115px]' }
  },
  {
    accessorKey: 'state',
    header: '状态',
    cell: ({ getValue }) => {
      const item = DEVICE_STATUS[getValue() as AdminPluginInventoryItem['state']];
      return <StatusPill tone={item.tone}>{item.label}</StatusPill>;
    },
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  },
  {
    id: 'loaderPhase',
    accessorFn: (row) => row.loaderPhase ?? '-',
    header: 'Loader',
    meta: { label: 'Loader', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  },
  {
    id: 'lastErrorCode',
    accessorFn: (row) => row.lastErrorCode ?? '-',
    header: '最近错误',
    cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '最近错误', className: 'w-[190px]', cellClassName: 'w-[190px]' }
  },
  {
    id: 'observedAt',
    accessorFn: (row) => formatDate(row.observedAt),
    header: '上报时间',
    meta: { label: '上报时间', className: 'w-[160px]', cellClassName: 'w-[160px]' }
  }
];

export function PluginManagementPage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const canWrite = bootstrap.permissions.includes('ent:plugin:write');
  const queryClient = useQueryClient();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('插件版本');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationBase, setRegistrationBase] = useState<PluginVersion>();
  const [publishTarget, setPublishTarget] = useState<{ version: PluginVersion; pluginPackage: PluginPackage; sourceVersionId?: string }>();
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [retireTarget, setRetireTarget] = useState<PluginVersion>();
  const members = useMembers(section === '可见范围' || assignmentOpen);
  const packages = useInfiniteQuery({
    queryKey: ['plugins', 'packages'],
    queryFn: ({ pageParam }) => loadPackages(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: section !== '设备状态',
    staleTime: 30_000
  });
  const inventory = useInfiniteQuery({
    queryKey: ['plugins', 'inventory'],
    queryFn: ({ pageParam }) => loadInventory(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: section === '设备状态',
    staleTime: 15_000
  });
  useEffect(() => {
    if (registrationOpen && packages.hasNextPage && !packages.isFetching && !packages.isFetchNextPageError) {
      void packages.fetchNextPage();
    }
  }, [registrationOpen, packages.hasNextPage, packages.isFetching, packages.isFetchNextPageError, packages.fetchNextPage]);
  const registration = useMutation({
    mutationFn: async (value: PluginRegistrationValue) => {
      const result = await registerPluginVersion({
        body: value
      });
      return unwrapData<PluginVersion>(result, '插件配置保存失败');
    },
    onSuccess: async (version) => {
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'packages'] });
      setRegistrationOpen(false);
      const pluginPackage = queryClient.getQueryData<InfiniteData<PluginPackagePageData>>(['plugins', 'packages'])
        ?.pages.flatMap(page => page.items).find(item => item.id === version.packageId);
      if (registrationBase && pluginPackage && version.status === 'VALIDATED') {
        changeVersion.reset();
        setPublishTarget({ version, pluginPackage, sourceVersionId: registrationBase.id });
      }
    }
  });
  const changeVersion = useMutation({
    mutationFn: async ({ action, version, upgrade }: { action: 'publish' | 'retire'; version: PluginVersion; upgrade?: PluginPublishRequest }) => {
      const options = { headers: { 'If-Match': version.revision }, path: { pluginVersionId: version.id } };
      const result = action === 'publish'
        ? await publishPluginVersion({ ...options, ...(upgrade ? { body: upgrade } : {}) })
        : await retirePluginVersion(options);
      requireSuccess(result, 'ENT_PLUGIN_VERSION_UPDATE_FAILED');
    },
    onSuccess: async (_data, variables) => {
      if (variables.action === 'retire') setRetireTarget(undefined);
      else setPublishTarget(undefined);
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'packages'] });
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: ['plugins', 'packages'] }); }
  });
  const saveAssignments = useMutation({
    mutationFn: async (value: PluginAssignmentValue) => {
      const result = await replacePluginAssignments({
        body: { items: value.items },
        headers: { 'Idempotency-Key': randomUuid(), 'If-Match': value.revision },
        path: { pluginPackageId: value.packageId }
      });
      requireSuccess(result, 'ENT_PLUGIN_ASSIGNMENT_UPDATE_FAILED');
    },
    onSuccess: async () => {
      setAssignmentOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'packages'] });
    }
  });
  const packageRows = useMemo(() => packages.data?.pages.flatMap((page) => page.items) ?? [], [packages.data]);
  const versionRows = useMemo(() => packageRows.flatMap((pluginPackage) => pluginPackage.versions.map((version) => ({
    ...version,
    displayName: version.installation.displayName,
    packageRevision: pluginPackage.revision
  }))), [packageRows]);
  const categoryOptions = useMemo(() => [...new Set(versionRows.flatMap(version => version.installation.categories))], [versionRows]);
  const memberNames = useMemo(() => new Map(members.data?.map((member) => [member.id, member.displayName]) ?? []), [members.data]);
  const assignmentRows = useMemo(() => packageRows.flatMap((pluginPackage) => pluginPackage.assignments
    .filter((assignment) => assignment.subjectType !== 'DEPT')
    .map((assignment) => ({
      ...assignment,
      displayName: pluginPackage.displayName,
      packageName: pluginPackage.packageName,
      subjectName: assignment.subjectType === 'ALL'
        ? '所有成员'
        : memberNames.get(assignment.subjectId ?? '') ?? '未知成员',
      version: pluginPackage.versions.find((version) => version.id === assignment.pluginVersionId)?.version ?? assignment.pluginVersionId
    }))), [memberNames, packageRows]);
  const inventoryRows = useMemo(() => inventory.data?.pages.flatMap((page) => page.items) ?? [], [inventory.data]);

  const table = section === '插件版本' ? (
    <ProductDataTable
      ariaLabel="插件版本"
      columns={versionColumnsWithActions(
        canWrite,
        changeVersion.isPending,
        (version) => {
          const pluginPackage = packageRows.find(item => item.id === version.packageId);
          if (pluginPackage) { changeVersion.reset(); setPublishTarget({ version, pluginPackage }); }
        },
        setRetireTarget,
        (version) => { registration.reset(); setRegistrationBase(version); setRegistrationOpen(true); }
      )}
      data={versionRows}
      emptyText="暂无插件版本"
      error={packages.error}
      filter={VERSION_FILTER}
      getRowId={(row) => row.id}
      hasMore={packages.hasNextPage}
      isLoading={packages.isLoading}
      isLoadingMore={packages.isFetchingNextPage}
      onLoadMore={() => void packages.fetchNextPage()}
      onRetry={() => void packages.refetch()}
      searchPlaceholder="搜索插件或版本"
      toolbarAction={canWrite ? (
        <Button variant="primary" size="xs" onClick={() => { registration.reset(); setRegistrationBase(undefined); setRegistrationOpen(true); }}>
          <Plus aria-hidden className="size-3.5" />
          添加插件
        </Button>
      ) : undefined}
    />
  ) : section === '可见范围' ? (
    <ProductDataTable
      ariaLabel="插件可见范围"
      columns={assignmentColumns}
      data={assignmentRows}
      emptyText="暂无可见范围"
      error={packages.error}
      filter={{ columnId: 'status', label: '全部状态', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'DISABLED' }] }}
      getRowId={(row) => row.id}
      hasMore={packages.hasNextPage}
      isLoading={packages.isLoading}
      isLoadingMore={packages.isFetchingNextPage}
      onLoadMore={() => void packages.fetchNextPage()}
      onRetry={() => void packages.refetch()}
      searchPlaceholder="搜索插件或分配对象"
      toolbarAction={canWrite ? (
        <Button variant="primary" size="xs" disabled={packageRows.length === 0} onClick={() => { saveAssignments.reset(); setAssignmentOpen(true); }}>
          <Settings2 aria-hidden className="size-3.5" />
          配置范围
        </Button>
      ) : undefined}
    />
  ) : (
    <ProductDataTable
      ariaLabel="插件设备状态"
      columns={inventoryColumns}
      data={inventoryRows}
      emptyText="暂无设备插件状态"
      error={inventory.error}
      filter={DEVICE_FILTER}
      getRowId={(row) => `${row.deviceId}:${row.packageName}`}
      hasMore={inventory.hasNextPage}
      isLoading={inventory.isLoading}
      isLoadingMore={inventory.isFetchingNextPage}
      onLoadMore={() => void inventory.fetchNextPage()}
      onRetry={() => void inventory.refetch()}
      searchPlaceholder="搜索成员、设备或插件"
    />
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">企业插件</h1>
          <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />
        </header>
        {changeVersion.error && !retireTarget && !publishTarget ? <p role="alert" className="m-0 text-[12.5px] text-red">{changeVersion.error.message}</p> : null}
        {table}
      </div>
      {registrationOpen ? (
        <RegisterPluginVersionDialog
          baseVersion={registrationBase}
          versions={packageRows.find(item => item.id === registrationBase?.packageId)?.versions}
          categoryOptions={categoryOptions}
          categoriesLoading={packages.isFetching}
          categoriesError={packages.isError}
          onRetryCategories={() => { void (packages.isFetchNextPageError ? packages.fetchNextPage() : packages.refetch()); }}
          error={registration.error?.message}
          saving={registration.isPending}
          onClose={() => { if (!registration.isPending) setRegistrationOpen(false); }}
          onSave={(value) => registration.mutate(value)}
        />
      ) : null}
      {publishTarget ? <PublishPluginVersionDialog
        {...publishTarget}
        error={changeVersion.error?.message}
        saving={changeVersion.isPending}
        onClose={() => { if (!changeVersion.isPending) setPublishTarget(undefined); }}
        onPublish={upgrade => changeVersion.mutate({ action: 'publish', version: publishTarget.version, upgrade })}
      /> : null}
      {assignmentOpen ? (
        <PluginAssignmentDialog
          error={saveAssignments.error?.message}
          packages={packageRows}
          saving={saveAssignments.isPending}
          onClose={() => setAssignmentOpen(false)}
          onSave={(value) => saveAssignments.mutate(value)}
        />
      ) : null}
      {retireTarget ? (
        <RetirePluginVersionDialog
          error={changeVersion.error?.message}
          saving={changeVersion.isPending}
          version={retireTarget}
          onClose={() => setRetireTarget(undefined)}
          onConfirm={() => changeVersion.mutate({ action: 'retire', version: retireTarget })}
        />
      ) : null}
    </div>
  );
}
