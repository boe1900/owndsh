/**
 * [INPUT]: 依赖成员/身份源 operation、console 权限、TanStack Query、ProductDataTable 与 ProductDialog。
 * [OUTPUT]: 提供成员目录、脱敏详情、角色/状态、一次性身份绑定和外部身份解除的 MemberManagementPage。
 * [POS]: features/members 的产品治理工作台；Server 独占 revision、最后管理员、设备和会话撤销裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronRight, Copy, Link, Power, PowerOff, Save, Unlink } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  getMember,
  listIdentitySources,
  replaceMemberRoles,
  startIdentityLink,
  unlinkMemberIdentity,
  updateMemberStatus
} from '@/api/generated/sdk.gen';
import type {
  AuthBuiltInRole,
  EnterpriseErrorResponse,
  IdentityLinkStart,
  IdentitySource,
  IdentitySourcePageData,
  MemberDetail,
  MemberPageData,
  MemberStatus,
  MemberSummary
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { loadMemberPage } from '@/features/member-select';

const ROLE_LABELS: Record<AuthBuiltInRole, string> = {
  enterprise_admin: '企业管理员',
  model_admin: '模型管理员',
  plugin_admin: '插件管理员',
  auditor: '审计员',
  employee: '成员'
};

const STATUS_FILTER = {
  columnId: 'status',
  label: '全部状态',
  options: [
    { label: '启用', value: 'ACTIVE' },
    { label: '停用', value: 'DISABLED' }
  ]
} as const;

const inputClass = 'h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:opacity-60';

function nextCursor(page: MemberPageData) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function roleLabel(roles: MemberSummary['roles']) {
  return roles.length === 0 ? '无角色' : roles.map((role) => ROLE_LABELS[role]).join('、');
}

function loginMethodLabel(methods: MemberSummary['loginMethods']) {
  const names = [...new Set(methods.map((method) => method.sourceName))];
  if (names.length === 0) return '未绑定';
  return names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`;
}

function activeAtLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '暂无活动';
}

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

async function loadMemberDetail(userId: string) {
  return unwrapData<MemberDetail>(await getMember({ path: { userId } }), '成员详情读取失败');
}

async function loadLinkSources() {
  const page = unwrapData<IdentitySourcePageData>(await listIdentitySources({ query: { limit: 200 } }), '身份源读取失败');
  return page.items.filter((source) => source.status === 'ACTIVE' && source.type !== 'LOCAL');
}

function memberColumns(onOpen: (member: MemberSummary) => void): ReadonlyArray<ProductTableColumn<MemberSummary>> {
  return [
  {
    accessorKey: 'displayName',
    header: '成员',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink" title={row.original.displayName}>{row.original.displayName}</div>
        <div className="truncate font-mono text-[11px] text-ink-3" title={row.original.username}>{row.original.username}</div>
      </div>
    ),
    meta: { label: '成员', className: 'w-[240px]', cellClassName: 'w-[240px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => {
      const active = getValue() === 'ACTIVE';
      return <StatusPill tone={active ? 'green' : 'neutral'}>{active ? '启用' : '停用'}</StatusPill>;
    },
    filterFn: 'equalsString',
    meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
  },
  {
    id: 'roles',
    accessorFn: (row) => roleLabel(row.roles),
    header: '固定角色',
    cell: ({ getValue }) => <span className="block truncate" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '固定角色', className: 'w-[250px]', cellClassName: 'w-[250px]' }
  },
  {
    id: 'loginMethods',
    accessorFn: (row) => loginMethodLabel(row.loginMethods),
    header: '登录方式',
    cell: ({ getValue }) => <span className="block truncate" title={String(getValue())}>{String(getValue())}</span>,
    meta: { label: '登录方式', className: 'w-[210px]', cellClassName: 'w-[210px]' }
  },
  {
    id: 'lastActiveAt',
    accessorFn: (row) => activeAtLabel(row.lastActiveAt),
    header: '最后活动',
    meta: { label: '最后活动', className: 'w-[180px]', cellClassName: 'w-[180px]' }
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button
        type="button"
        variant="quiet"
        size="xs"
        className="size-7 rounded-md p-0"
        aria-label={`查看 ${row.original.displayName}`}
        title={`查看 ${row.original.displayName}`}
        onClick={() => onOpen(row.original)}
      >
        <ChevronRight aria-hidden className="size-4" />
      </Button>
    ),
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    meta: { label: '操作', className: 'w-12', cellClassName: 'w-12' }
  }
  ];
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[100px_minmax(0,1fr)] gap-3 py-2 text-[12.5px]">
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0 truncate text-ink" title={value}>{value}</span>
    </div>
  );
}

function MemberDetailDialog({
  canWrite,
  detail,
  error,
  linkSources,
  linkSourcesLoading,
  onClose,
  onLink,
  onRoles,
  onStatus,
  onUnlink,
  saving
}: {
  canWrite: boolean;
  detail: MemberDetail;
  error?: string;
  linkSources: IdentitySource[];
  linkSourcesLoading: boolean;
  onClose: () => void;
  onLink: (sourceId: string) => void;
  onRoles: (roles: AuthBuiltInRole[]) => void;
  onStatus: (status: MemberStatus) => void;
  onUnlink: (identityId: string) => void;
  saving: boolean;
}) {
  const [roles, setRoles] = useState<AuthBuiltInRole[]>(detail.member.roles);
  const [sourceId, setSourceId] = useState('');
  const sameRoles = roles.length === detail.member.roles.length
    && roles.every((role) => detail.member.roles.includes(role));
  const targetStatus: MemberStatus = detail.member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  const boundSourceIds = new Set(detail.identities.flatMap((identity) => identity.sourceId ? [identity.sourceId] : []));
  const availableSources = linkSources.filter((source) => !boundSourceIds.has(source.id));

  return (
    <ProductDialog className="max-w-[720px]" title={detail.member.displayName} onClose={onClose}>
      <div className="grid gap-5 p-5">
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="m-0 text-[13px] font-semibold text-ink">基本信息</h3>
            <StatusPill tone={detail.member.status === 'ACTIVE' ? 'green' : 'neutral'}>
              {detail.member.status === 'ACTIVE' ? '启用' : '停用'}
            </StatusPill>
          </div>
          <div className="divide-y divide-line">
            <DetailRow label="平台账号" value={detail.member.username} />
            <DetailRow label="最后活动" value={activeAtLabel(detail.member.lastActiveAt)} />
          </div>
        </section>

        <fieldset className="grid gap-3 border-0 p-0">
          <legend className="text-[13px] font-semibold text-ink">固定角色</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.entries(ROLE_LABELS) as Array<[AuthBuiltInRole, string]>).map(([role, label]) => (
              <label key={role} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  disabled={!canWrite || saving}
                  onChange={(event) => setRoles((current) => event.target.checked
                    ? [...current, role]
                    : current.filter((value) => value !== role))}
                />
                {label}
              </label>
            ))}
          </div>
          {canWrite ? (
            <div>
              <Button
                type="button"
                size="sm"
                disabled={saving || roles.length === 0 || sameRoles}
                onClick={() => onRoles(roles)}
              >
                <Save aria-hidden className="size-3.5" />
                保存角色
              </Button>
            </div>
          ) : null}
        </fieldset>

        <section>
          <h3 className="mb-2 mt-0 text-[13px] font-semibold text-ink">登录身份</h3>
          {canWrite ? (
            <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row">
              <select
                aria-label="身份源"
                className={inputClass}
                value={sourceId}
                disabled={saving || linkSourcesLoading || availableSources.length === 0}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">{linkSourcesLoading ? '正在加载...' : '选择身份源'}</option>
                {availableSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.name} ({source.type})</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={saving || sourceId === ''}
                onClick={() => onLink(sourceId)}
              >
                <Link aria-hidden className="size-3.5" />
                添加登录方式
              </Button>
            </div>
          ) : null}
          {detail.identities.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">未绑定</p> : (
            <div className="divide-y divide-line">
              {detail.identities.map((identity) => (
                <div key={identity.identityId ?? 'local'} className="flex min-w-0 items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-ink">{identity.sourceName}</div>
                    <div className="truncate font-mono text-[11px] text-ink-3" title={identity.subject}>{identity.subject}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="quiet"
                      size="xs"
                      className="size-7 rounded-md p-0"
                      aria-label={`复制 ${identity.sourceName} subject`}
                      title="复制 subject"
                      onClick={() => void navigator.clipboard?.writeText(identity.subject)}
                    >
                      <Copy aria-hidden className="size-3.5" />
                    </Button>
                    {canWrite && identity.identityId ? (
                      <Button
                        type="button"
                        variant="quiet"
                        size="xs"
                        className="size-7 rounded-md p-0"
                        disabled={saving}
                        aria-label={`解除 ${identity.sourceName}`}
                        title="解除登录身份"
                        onClick={() => {
                          if (!window.confirm(`确认解除 ${identity.sourceName}？`)) return;
                          onUnlink(identity.identityId!);
                        }}
                      >
                        <Unlink aria-hidden className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 mt-0 text-[13px] font-semibold text-ink">设备</h3>
          {detail.devices.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">暂无设备</p> : (
            <div className="divide-y divide-line">
              {detail.devices.map((device) => (
                <div key={device.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{device.name}</div>
                    <div className="text-[11px] text-ink-3">{device.platform} · {activeAtLabel(device.lastSeenAt)}</div>
                  </div>
                  <StatusPill tone={device.status === 'ACTIVE' ? 'green' : 'neutral'}>
                    {device.status === 'ACTIVE' ? '启用' : '已撤销'}
                  </StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 mt-0 text-[13px] font-semibold text-ink">Session</h3>
          <div className="divide-y divide-line">
            <DetailRow label="活跃" value={String(detail.sessions.active)} />
            <DetailRow label="已删除" value={String(detail.sessions.deleted)} />
            <DetailRow label="已过期" value={String(detail.sessions.expired)} />
          </div>
        </section>

        {error ? <p role="alert" className="m-0 text-[12.5px] text-red">{error}</p> : null}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
        {canWrite ? (
          <Button
            type="button"
            variant="quiet"
            size="sm"
            disabled={saving}
            onClick={() => {
              if (targetStatus === 'DISABLED' && !window.confirm(`确认停用 ${detail.member.displayName}？`)) return;
              onStatus(targetStatus);
            }}
          >
            {targetStatus === 'DISABLED' ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}
            {targetStatus === 'DISABLED' ? '停用成员' : '启用成员'}
          </Button>
        ) : <span />}
        <Button type="button" size="sm" onClick={onClose}>关闭</Button>
      </footer>
    </ProductDialog>
  );
}

export function MemberManagementPage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const canWrite = bootstrap.permissions.includes('ent:member:write');
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const members = useInfiniteQuery({
    queryKey: ['members', 'list'],
    queryFn: ({ pageParam }) => loadMemberPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000
  });
  const rows = useMemo(() => members.data?.pages.flatMap((page) => page.items) ?? [], [members.data]);
  const columns = useMemo(() => memberColumns((member) => setSelectedId(member.id)), []);
  const detail = useQuery({
    queryKey: ['member', selectedId],
    queryFn: () => loadMemberDetail(selectedId!),
    enabled: selectedId !== undefined
  });
  const linkSources = useQuery({
    queryKey: ['identity-sources', 'link'],
    queryFn: loadLinkSources,
    enabled: selectedId !== undefined && canWrite,
    staleTime: 60_000
  });
  const roles = useMutation({
    mutationFn: async (nextRoles: AuthBuiltInRole[]) => unwrapData<MemberDetail>(await replaceMemberRoles({
      body: { roles: nextRoles },
      headers: { 'If-Match': detail.data!.member.revision },
      path: { userId: detail.data!.member.id }
    }), '成员角色更新失败'),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['member', updated.member.id], updated);
      setNotice('成员角色已更新');
      await queryClient.invalidateQueries({ queryKey: ['members', 'list'] });
    }
  });
  const status = useMutation({
    mutationFn: async (nextStatus: MemberStatus) => unwrapData<MemberDetail>(await updateMemberStatus({
      body: { status: nextStatus },
      headers: { 'If-Match': detail.data!.member.revision },
      path: { userId: detail.data!.member.id }
    }), '成员状态更新失败'),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['member', updated.member.id], updated);
      setNotice(updated.member.status === 'ACTIVE' ? '成员已启用' : '成员已停用');
      await queryClient.invalidateQueries({ queryKey: ['members', 'list'] });
    }
  });
  const unlink = useMutation({
    mutationFn: async (identityId: string) => unwrapData<MemberDetail>(await unlinkMemberIdentity({
      headers: { 'If-Match': detail.data!.member.revision },
      path: { userId: detail.data!.member.id, identityId }
    }), '登录身份解除失败'),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['member', updated.member.id], updated);
      setNotice('登录身份已解除');
      await queryClient.invalidateQueries({ queryKey: ['members', 'list'] });
    }
  });
  const link = useMutation({
    mutationFn: async (sourceId: string) => unwrapData<IdentityLinkStart>(await startIdentityLink({
      body: { sourceId },
      path: { userId: detail.data!.member.id }
    }), '身份绑定发起失败'),
    onSuccess: (started) => window.location.assign(started.authorizeUri)
  });
  const mutationError = roles.error ?? status.error ?? unlink.error ?? link.error ?? linkSources.error;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header className="border-b border-line pb-5">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">成员</h1>
        </header>
        {notice ? <div role="status" className="rounded-lg bg-green-tint px-3 py-2 text-[12.5px] text-green">{notice}</div> : null}
        <ProductDataTable
          ariaLabel="成员目录"
          columns={columns}
          data={rows}
          emptyText="暂无成员"
          error={members.error}
          filter={STATUS_FILTER}
          getRowId={(row) => row.id}
          hasMore={members.hasNextPage}
          isLoading={members.isLoading}
          isLoadingMore={members.isFetchingNextPage}
          onLoadMore={() => void members.fetchNextPage()}
          onRetry={() => void members.refetch()}
          searchPlaceholder="搜索成员、账号、角色或登录方式"
        />
      </div>
      {selectedId && detail.isLoading ? (
        <ProductDialog title="成员详情" onClose={() => setSelectedId(undefined)}>
          <p className="m-0 p-5 text-[12.5px] text-ink-3">正在加载...</p>
        </ProductDialog>
      ) : null}
      {selectedId && detail.error ? (
        <ProductDialog title="成员详情" onClose={() => setSelectedId(undefined)}>
          <div className="grid gap-3 p-5">
            <p role="alert" className="m-0 text-[12.5px] text-red">{errorMessage(detail.error, '成员详情读取失败')}</p>
            <div><Button type="button" size="sm" onClick={() => void detail.refetch()}>重试</Button></div>
          </div>
        </ProductDialog>
      ) : null}
      {selectedId && detail.data ? (
        <MemberDetailDialog
          key={`${detail.data.member.id}:${detail.data.member.revision}`}
          canWrite={canWrite}
          detail={detail.data}
          error={mutationError ? errorMessage(mutationError, '成员更新失败') : undefined}
          linkSources={linkSources.data ?? []}
          linkSourcesLoading={linkSources.isLoading}
          saving={roles.isPending || status.isPending || unlink.isPending || link.isPending}
          onClose={() => setSelectedId(undefined)}
          onLink={(sourceId) => link.mutate(sourceId)}
          onRoles={(nextRoles) => roles.mutate(nextRoles)}
          onStatus={(nextStatus) => status.mutate(nextStatus)}
          onUnlink={(identityId) => unlink.mutate(identityId)}
        />
      ) : null}
    </div>
  );
}
