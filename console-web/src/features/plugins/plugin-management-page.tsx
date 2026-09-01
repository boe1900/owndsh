/**
 * [INPUT]: 依赖生成的插件管理 operation、成员目录、console 权限事实、TanStack Query、ProductDataTable 与插件编辑器。
 * [OUTPUT]: 提供插件版本、ALL/USER 分配和设备状态三视图，以及上传、发布、退休与原子分配管理动作。
 * [POS]: features/plugins 的产品插件工作台；服务端负责验包、签名、状态机、分配裁决和设备事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { Archive, CloudUpload, Settings2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  listPluginInventory,
  listPluginPackages,
  publishPluginVersion,
  replacePluginAssignments,
  retirePluginVersion,
  uploadPluginVersion
} from '@/api/generated/sdk.gen';
import type {
  AdminPluginInventoryItem,
  AdminPluginInventoryPageData,
  EnterpriseErrorResponse,
  PluginAssignment,
  PluginPackage,
  PluginPackagePageData,
  PluginVersion
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/atoms/SegmentedControl';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { useMembers } from '@/features/member-select';
import {
  PluginAssignmentDialog,
  RetirePluginVersionDialog,
  UploadPluginVersionDialog,
  type PluginAssignmentValue,
  type PluginUploadValue
} from './plugin-editors';

const SECTIONS = ['插件版本', '分配策略', '设备状态'] as const;

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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const VERSION_STATUS = {
  UPLOADED: { label: '已上传', tone: 'neutral' },
  VALIDATED: { label: '已验证', tone: 'accent' },
  PUBLISHED: { label: '已发布', tone: 'green' },
  RETIRED: { label: '已退休', tone: 'neutral' }
} as const;

const DEVICE_STATUS: Record<AdminPluginInventoryItem['state'], { label: string; tone: 'accent' | 'green' | 'neutral' | 'orange' | 'red' }> = {
  EXPECTED: { label: '等待处理', tone: 'neutral' },
  DOWNLOAD_PENDING: { label: '等待下载', tone: 'accent' },
  DOWNLOADING: { label: '下载中', tone: 'accent' },
  VERIFIED: { label: '已验证', tone: 'accent' },
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
    id: 'operatingSystems',
    accessorFn: (row) => row.compatibility.operatingSystems.join(' / '),
    header: '操作系统',
    meta: { label: '操作系统', className: 'w-[155px]', cellClassName: 'w-[155px]' }
  },
  {
    id: 'enterpriseBundleRange',
    accessorFn: (row) => row.compatibility.enterpriseBundleRange,
    header: 'Bundle 范围',
    cell: ({ getValue }) => <span className="block truncate font-mono text-[12px]" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: 'Bundle 范围', className: 'w-[150px]', cellClassName: 'w-[150px]' }
  },
  {
    id: 'sizeBytes',
    accessorFn: (row) => formatBytes(row.sizeBytes),
    header: '大小',
    meta: { label: '大小', className: 'w-[90px]', cellClassName: 'w-[90px]' }
  },
  {
    id: 'createdAt',
    accessorFn: (row) => formatDate(row.createdAt),
    header: '上传时间',
    meta: { label: '上传时间', className: 'w-[160px]', cellClassName: 'w-[160px]' }
  }
];

function versionColumnsWithActions(
  canWrite: boolean,
  disabled: boolean,
  onPublish: (version: PluginVersion) => void,
  onRetire: (version: PluginVersion) => void
): ReadonlyArray<ProductTableColumn<PluginVersionRow>> {
  if (!canWrite) return versionColumns;
  return [...versionColumns, {
    id: 'actions',
    header: '操作',
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => row.original.status === 'VALIDATED' ? (
      <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`发布 ${row.original.packageName}@${row.original.version}`} title="发布" onClick={() => onPublish(row.original)}>
        <CloudUpload aria-hidden className="size-3.5" />
      </Button>
    ) : row.original.status === 'PUBLISHED' ? (
      <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={disabled} aria-label={`退休 ${row.original.packageName}@${row.original.version}`} title="退休" onClick={() => onRetire(row.original)}>
        <Archive aria-hidden className="size-3.5" />
      </Button>
    ) : null,
    meta: { label: '操作', className: 'w-[80px]', cellClassName: 'w-[80px]' }
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
    header: '分配对象',
    meta: { label: '分配对象', className: 'w-[220px]', cellClassName: 'w-[220px]' }
  },
  {
    id: 'desiredState',
    accessorFn: (row) => row.desiredState === 'INSTALLED' ? '安装' : '移除',
    header: '期望状态',
    meta: { label: '期望状态', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  },
  {
    id: 'required',
    accessorFn: (row) => row.required ? '强制' : '可选',
    header: '策略',
    meta: { label: '策略', className: 'w-[100px]', cellClassName: 'w-[100px]' }
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [retireTarget, setRetireTarget] = useState<PluginVersion>();
  const members = useMembers(section === '分配策略' || assignmentOpen);
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
  const upload = useMutation({
    mutationFn: async (value: PluginUploadValue) => {
      const result = await uploadPluginVersion({
        body: value,
        headers: { 'Idempotency-Key': crypto.randomUUID() }
      });
      requireSuccess(result, 'ENT_PLUGIN_UPLOAD_FAILED');
    },
    onSuccess: async () => {
      setUploadOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'packages'] });
    }
  });
  const changeVersion = useMutation({
    mutationFn: async ({ action, version }: { action: 'publish' | 'retire'; version: PluginVersion }) => {
      const options = { headers: { 'If-Match': version.revision }, path: { pluginVersionId: version.id } };
      const result = action === 'publish'
        ? await publishPluginVersion(options)
        : await retirePluginVersion(options);
      requireSuccess(result, 'ENT_PLUGIN_VERSION_UPDATE_FAILED');
    },
    onSuccess: async (_data, variables) => {
      if (variables.action === 'retire') setRetireTarget(undefined);
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'packages'] });
    }
  });
  const saveAssignments = useMutation({
    mutationFn: async (value: PluginAssignmentValue) => {
      const result = await replacePluginAssignments({
        body: { items: value.items },
        headers: { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': value.revision },
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
    displayName: pluginPackage.displayName,
    packageRevision: pluginPackage.revision
  }))), [packageRows]);
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
        (version) => changeVersion.mutate({ action: 'publish', version }),
        setRetireTarget
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
        <Button variant="primary" size="xs" onClick={() => { upload.reset(); setUploadOpen(true); }}>
          <Upload aria-hidden className="size-3.5" />
          上传版本
        </Button>
      ) : undefined}
    />
  ) : section === '分配策略' ? (
    <ProductDataTable
      ariaLabel="插件分配策略"
      columns={assignmentColumns}
      data={assignmentRows}
      emptyText="暂无插件分配策略"
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
          配置分配
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
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">插件</h1>
          <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />
        </header>
        {changeVersion.error && !retireTarget ? <p role="alert" className="m-0 text-[12.5px] text-red">{changeVersion.error.message}</p> : null}
        {table}
      </div>
      {uploadOpen ? (
        <UploadPluginVersionDialog
          error={upload.error?.message}
          saving={upload.isPending}
          onClose={() => setUploadOpen(false)}
          onSave={(value) => upload.mutate(value)}
        />
      ) : null}
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
