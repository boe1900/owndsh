/**
 * [INPUT]: 依赖成员/身份源 operation、用户组/身份接入管理器、console 权限、TanStack Query、产品表格/对话框、lib/crypto 与 coss UI Avatar/Badge/Button/Card/Checkbox/Empty/Field/Fieldset/Input/Select/Spinner/Tabs/Alert。
 * [OUTPUT]: 提供默认筛选启用成员的目录（首字母头像、角色徽章、登录方式与页头分区）、详情四区块卡片、LOCAL 创建、LDAP 单人导入、用户组、身份接入、角色/状态和身份绑定治理。
 * [POS]: features/members 的产品治理工作台；Server 独占 revision、身份源组同步、最后管理员和设备撤销裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { Clock, Copy, KeyRound, Laptop, Link, Power, PowerOff, Save, Unlink, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createLocalMember,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Fieldset, FieldsetLegend } from '@/components/ui/fieldset';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';
import {
  ProductDataTable,
  TableStackCell,
  TableStatusBadge,
  type ProductTableColumn
} from '@/components/product/DataTable';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { loadMemberPage } from '@/features/member-select';
import { randomUuid } from '@/lib/crypto';
import { AccessGroupManagement } from './access-group-management';
import { IdentitySourceManagement } from './identity-source-management';
import { LdapMemberImportDialog } from './ldap-member-import';

type MemberSection = '成员' | '用户组' | '身份接入';

const ROLE_LABELS: Record<AuthBuiltInRole, string> = {
  enterprise_admin: '企业管理员',
  model_admin: '模型管理员',
  plugin_admin: '插件管理员',
  auditor: '审计员',
  employee: '成员'
};

const ROLE_META: Record<AuthBuiltInRole, { label: string; description: string; variant: 'default' | 'info' | 'secondary' | 'warning' | 'outline' }> = {
  enterprise_admin: { label: '企业管理员', description: '拥有全平台最高管理权限', variant: 'default' },
  model_admin: { label: '模型管理员', description: '管理供应商、连接通道与模型集', variant: 'info' },
  plugin_admin: { label: '插件管理员', description: '管理 MCP、插件与技能扩展', variant: 'secondary' },
  auditor: { label: '审计员', description: '查看活动记录、配额与安全审计日志', variant: 'warning' },
  employee: { label: '成员', description: '基础模型调用与工作台使用权限', variant: 'outline' }
};

const STATUS_FILTER = {
  columnId: 'status',
  defaultFilterValue: 'ACTIVE',
  label: '全部状态',
  options: [
    { label: '启用', value: 'ACTIVE' },
    { label: '停用', value: 'DISABLED' }
  ]
} as const;

function LocalMemberCreateDialog({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (member: MemberDetail) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [formError, setFormError] = useState<string>();
  const create = useMutation({
    mutationFn: async () => unwrapData<MemberDetail>(await createLocalMember({
      body: {
        username: username.trim(),
        displayName: displayName.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        initialPassword
      },
      headers: { 'Idempotency-Key': randomUuid() }
    }), '本地成员创建失败'),
    onSuccess: onCreated
  });

  return (
    <ProductDialog title="新建本地成员" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFormError(undefined);
          if (initialPassword !== confirmation) {
            setFormError('两次输入的密码不一致');
            return;
          }
          create.mutate();
        }}
      >
        <div className="grid gap-4 p-5">
          <Field className="w-full">
            <FieldLabel>用户名</FieldLabel>
            <Input required autoComplete="username" maxLength={30} minLength={3} pattern="[A-Za-z][A-Za-z0-9._-]{2,29}" value={username} onChange={(event) => setUsername(event.target.value)} />
          </Field>
          <Field className="w-full">
            <FieldLabel>显示名称</FieldLabel>
            <Input required autoComplete="name" maxLength={30} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
          <Field className="w-full">
            <FieldLabel>邮箱（可选）</FieldLabel>
            <Input autoComplete="email" maxLength={50} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field className="w-full">
            <FieldLabel>初始密码</FieldLabel>
            <Input required autoComplete="new-password" maxLength={128} minLength={14} type="password" value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} />
          </Field>
          <Field className="w-full">
            <FieldLabel>确认初始密码</FieldLabel>
            <Input required autoComplete="new-password" maxLength={128} minLength={14} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </Field>
          {formError || create.error ? <Alert variant="error"><AlertDescription>{formError ?? errorMessage(create.error, '本地成员创建失败')}</AlertDescription></Alert> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={onClose}>取消</Button>
          <Button type="submit" size="sm" disabled={create.isPending}>{create.isPending ? '创建中' : '创建'}</Button>
        </DialogFooter>
      </form>
    </ProductDialog>
  );
}

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
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-7 shrink-0 text-xs">
            <AvatarFallback className="bg-primary/10 font-semibold text-primary">{row.original.displayName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <TableStackCell primary={row.original.displayName} secondary={row.original.username} />
        </div>
      ),
      meta: { label: '成员', className: 'w-[230px]', cellClassName: 'w-[230px]' }
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ getValue }) => {
        const active = getValue() === 'ACTIVE';
        return <TableStatusBadge tone={active ? 'success' : 'neutral'} label={active ? '启用' : '停用'} />;
      },
      filterFn: 'equalsString',
      meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' }
    },
    {
      id: 'roles',
      accessorFn: (row) => roleLabel(row.roles),
      header: '固定角色',
      cell: ({ row }) => {
        const roles = row.original.roles;
        if (roles.length === 0) return <span className="text-xs text-muted-foreground">无角色</span>;
        const shown = roles.slice(0, 2);
        const rest = roles.length - shown.length;
        return (
          <div className="flex min-w-0 items-center gap-1 overflow-hidden" title={roleLabel(roles)}>
            {shown.map((role) => (
              <Badge key={role} variant="outline" size="sm">{ROLE_META[role].label}</Badge>
            ))}
            {rest > 0 ? <Badge variant="secondary" size="sm" className="tabular-nums">+{rest}</Badge> : null}
          </div>
        );
      },
      meta: { label: '固定角色', className: 'w-[220px]', cellClassName: 'w-[220px]' }
    },
    {
      id: 'loginMethods',
      accessorFn: (row) => loginMethodLabel(row.loginMethods),
      header: '登录方式',
      cell: ({ row }) => {
        const names = [...new Set(row.original.loginMethods.map((method) => method.sourceName))];
        if (names.length === 0) return <span className="text-xs text-muted-foreground">未绑定</span>;
        const first = names[0]!;
        const rest = names.length - 1;
        return (
          <div className="flex min-w-0 items-center gap-1 overflow-hidden" title={names.join('、')}>
            <Badge variant="outline" className="max-w-[140px] min-w-0">
              <KeyRound aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{first}</span>
            </Badge>
            {rest > 0 ? <Badge variant="secondary" className="tabular-nums">+{rest}</Badge> : null}
          </div>
        );
      },
      meta: { label: '登录方式', className: 'w-[200px]', cellClassName: 'w-[200px]' }
    },
    {
      id: 'lastActiveAt',
      accessorFn: (row) => activeAtLabel(row.lastActiveAt),
      header: '最后活动',
      cell: ({ row }) => <span className="block truncate font-mono text-xs text-muted-foreground tabular-nums" title={activeAtLabel(row.original.lastActiveAt)}>{activeAtLabel(row.original.lastActiveAt)}</span>,
      meta: { label: '最后活动', className: 'w-[165px]', cellClassName: 'w-[165px]' }
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button type="button" variant="outline" size="xs" onClick={() => onOpen(row.original)}>
          详情
        </Button>
      ),
      enableGlobalFilter: false,
      enableHiding: false,
      enableSorting: false,
      meta: { label: '操作', className: 'w-[80px]', cellClassName: 'w-[80px]' }
    }
  ];
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
  const [confirmAction, setConfirmAction] = useState<{ kind: 'status'; status: MemberStatus } | { kind: 'unlink'; identityId: string; sourceName: string }>();
  const sameRoles = roles.length === detail.member.roles.length
    && roles.every((role) => detail.member.roles.includes(role));
  const targetStatus: MemberStatus = detail.member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  const boundSourceIds = new Set(detail.identities.flatMap((identity) => identity.sourceId ? [identity.sourceId] : []));
  const availableSources = linkSources.filter((source) => !boundSourceIds.has(source.id));
  const sourceItems = [
    { label: linkSourcesLoading ? '正在加载...' : '选择身份源', value: '' },
    ...availableSources.map((source) => ({ label: `${source.name} (${source.type})`, value: source.id }))
  ];

  return (
    <>
      <ProductDialog className="max-w-[720px]" title={detail.member.displayName} onClose={onClose}>
        <div className="grid gap-5 p-5">
          <section className="flex items-center gap-3">
            <Avatar className="size-10 shrink-0 text-sm">
              <AvatarFallback className="bg-primary/10 font-semibold text-primary">{detail.member.displayName.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="m-0 text-base font-semibold text-foreground">{detail.member.displayName}</h3>
                <Badge variant={detail.member.status === 'ACTIVE' ? 'success' : 'secondary'}>
                  {detail.member.status === 'ACTIVE' ? '启用' : '停用'}
                </Badge>
              </div>
              <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">管理该成员的账号信息、平台固定角色、外部登录身份与受管终端设备</p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 mt-0 text-[13px] font-semibold text-foreground">基本信息</h3>
            <Card className="grid gap-3 bg-muted/40 p-3.5 shadow-none sm:grid-cols-2">
              <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
                <span className="shrink-0 text-xs text-muted-foreground">平台账号</span>
                <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
                  <span className="truncate" title={detail.member.username}>{detail.member.username}</span>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="复制平台账号" title="复制账号" onClick={() => void navigator.clipboard?.writeText(detail.member.username)}>
                    <Copy aria-hidden className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start sm:border-l sm:pl-4">
                <span className="shrink-0 text-xs text-muted-foreground">最后活动</span>
                <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Clock aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate" title={activeAtLabel(detail.member.lastActiveAt)}>{activeAtLabel(detail.member.lastActiveAt)}</span>
                </span>
              </div>
            </Card>
          </section>

          <Fieldset className="grid max-w-none gap-3 border-0 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldsetLegend className="text-[13px] font-semibold">固定角色 <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">可多选，未勾选任何项时为“无角色”</span></FieldsetLegend>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  variant={!sameRoles && roles.length > 0 ? 'default' : 'secondary'}
                  disabled={saving || roles.length === 0 || sameRoles}
                  onClick={() => onRoles(roles)}
                >
                  <Save aria-hidden className="size-3.5" />
                  保存角色
                  {!sameRoles && roles.length > 0 ? <span aria-hidden className="ml-0.5 size-1.5 rounded-full bg-warning" /> : null}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.entries(ROLE_META) as Array<[AuthBuiltInRole, typeof ROLE_META.employee]>).map(([role, meta]) => {
                const checked = roles.includes(role);
                return (
                  <label key={role} className={`flex cursor-pointer select-none items-start gap-2.5 rounded-xl border p-3 transition ${checked ? 'border-ring bg-muted/60 shadow-sm' : 'bg-card hover:bg-muted/40'} ${!canWrite || saving ? 'cursor-not-allowed opacity-60' : ''}`}>
                    <Checkbox
                      className="mt-0.5 shrink-0"
                      aria-label={meta.label}
                      checked={checked}
                      disabled={!canWrite || saving}
                      onCheckedChange={(next) => setRoles((current) => next
                        ? [...current, role]
                        : current.filter((value) => value !== role))}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-foreground">{meta.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{meta.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Fieldset>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="m-0 text-[13px] font-semibold text-foreground">登录身份</h3>
              <span className="text-[11px] text-muted-foreground">已绑定 {detail.identities.length} 个登录方式</span>
            </div>
            {canWrite ? (
              <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row">
                <Select
                  items={sourceItems}
                  value={sourceId}
                  disabled={saving || linkSourcesLoading || availableSources.length === 0}
                  onValueChange={(next) => setSourceId(next ?? '')}
                >
                  <SelectTrigger aria-label="身份源" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {sourceItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                  </SelectPopup>
                </Select>
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
            {detail.identities.length === 0 ? <p className="m-0 text-[12.5px] text-muted-foreground">未绑定</p> : (
              <div className="grid gap-2">
                {detail.identities.map((identity) => (
                  <Card key={identity.identityId ?? 'local'} className="flex min-w-0 flex-row items-center gap-3 bg-muted/40 p-3.5 shadow-none">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-primary">
                      <KeyRound aria-hidden className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-foreground">{identity.sourceName}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground" title={identity.subject}>{identity.subject}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`复制 ${identity.sourceName} subject`} title="复制 subject" onClick={() => void navigator.clipboard?.writeText(identity.subject)}>
                        <Copy aria-hidden className="size-3.5" />
                      </Button>
                      {canWrite && identity.identityId ? (
                        <Button type="button" variant="ghost" size="icon-xs" disabled={saving} aria-label={`解除 ${identity.sourceName}`} title="解除登录身份" onClick={() => setConfirmAction({ kind: 'unlink', identityId: identity.identityId!, sourceName: identity.sourceName })}>
                          <Unlink aria-hidden className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="m-0 text-[13px] font-semibold text-foreground">设备</h3>
              <span className="text-[11px] text-muted-foreground">共 {detail.devices.length} 台已注册客户端设备</span>
            </div>
            {detail.devices.length === 0 ? (
              <Empty className="py-6">
                <EmptyTitle className="text-sm">暂无已注册的受管设备记录</EmptyTitle>
                <EmptyDescription className="text-xs">成员登录客户端后会自动注册设备</EmptyDescription>
              </Empty>
            ) : (
              <div className="grid gap-2">
                {detail.devices.map((device) => (
                  <Card key={device.id} className="flex flex-row items-center gap-3 p-3.5 shadow-none">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Laptop aria-hidden className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-foreground">{device.name}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{device.platform} · {activeAtLabel(device.lastSeenAt)}</div>
                    </div>
                    <Badge variant={device.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {device.status === 'ACTIVE' ? '启用' : '已撤销'}
                    </Badge>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {error ? <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
        <DialogFooter>
          {canWrite ? (
            <Button
              type="button"
              variant={targetStatus === 'DISABLED' ? 'destructive-outline' : 'outline'}
              size="sm"
              disabled={saving}
              onClick={() => setConfirmAction({ kind: 'status', status: targetStatus })}
            >
              {targetStatus === 'DISABLED' ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}
              {targetStatus === 'DISABLED' ? '停用成员' : '启用成员'}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </ProductDialog>
      {confirmAction?.kind === 'status' ? <ConfirmDialog
        title={confirmAction.status === 'DISABLED' ? '停用成员' : '启用成员'}
        description={`确认${confirmAction.status === 'DISABLED' ? '停用' : '启用'}成员“${detail.member.displayName}”？`}
        confirmLabel={confirmAction.status === 'DISABLED' ? '停用' : '启用'}
        saving={saving}
        onClose={() => { if (!saving) setConfirmAction(undefined); }}
        onConfirm={() => { setConfirmAction(undefined); onStatus(confirmAction.status); }}
      /> : null}
      {confirmAction?.kind === 'unlink' ? <ConfirmDialog
        title="解除登录身份"
        description={`确认解除“${confirmAction.sourceName}”登录身份？`}
        confirmLabel="解除身份"
        saving={saving}
        onClose={() => { if (!saving) setConfirmAction(undefined); }}
        onConfirm={() => { setConfirmAction(undefined); onUnlink(confirmAction.identityId); }}
      /> : null}
    </>
  );
}

export function MemberManagementPage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const canWrite = bootstrap.permissions.includes('ent:member:write');
  const canReadIdentity = bootstrap.permissions.includes('ent:identity:read');
  const canWriteIdentity = bootstrap.permissions.includes('ent:identity:write');
  const sections: readonly MemberSection[] = canReadIdentity ? ['成员', '用户组', '身份接入'] : ['成员', '用户组'];
  const queryClient = useQueryClient();
  const [section, setSection] = useState<MemberSection>('成员');
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
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
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-stable">
      <div className="mx-auto flex h-full min-h-[540px] w-full max-w-[1320px] flex-col gap-5 px-5 py-6 sm:px-8 sm:py-7">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-5">
          <h1 className="m-0 font-heading text-xl font-semibold tracking-tight leading-tight text-foreground">成员</h1>
          <Tabs value={section} onValueChange={(next) => setSection(next as MemberSection)}>
            <TabsList>
              {sections.map((item) => <TabsTab key={item} value={item}>{item}</TabsTab>)}
            </TabsList>
          </Tabs>
        </header>
        {section === '成员' ? (
          <>
            {notice ? <Alert variant="success"><AlertDescription>{notice}</AlertDescription></Alert> : null}
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
              toolbarAction={canWrite ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setImporting(true)}><UserPlus aria-hidden />从 LDAP 导入</Button>
                  <Button size="sm" onClick={() => setCreating(true)}><UserPlus aria-hidden />新建本地成员</Button>
                </div>
              ) : undefined}
            />
          </>
        ) : section === '用户组' ? <AccessGroupManagement canWrite={canWrite} /> : <IdentitySourceManagement canWrite={canWriteIdentity} />}
      </div>
      {selectedId && detail.isLoading ? (
        <ProductDialog title="成员详情" onClose={() => setSelectedId(undefined)}>
          <div className="flex items-center gap-2.5 p-5 text-sm text-muted-foreground"><Spinner className="size-4" />正在加载...</div>
        </ProductDialog>
      ) : null}
      {selectedId && detail.error ? (
        <ProductDialog title="成员详情" onClose={() => setSelectedId(undefined)}>
          <div className="grid gap-3 p-5">
            <Alert variant="error"><AlertDescription>{errorMessage(detail.error, '成员详情读取失败')}</AlertDescription></Alert>
            <div><Button type="button" variant="outline" size="sm" onClick={() => void detail.refetch()}>重试</Button></div>
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
      {creating ? <LocalMemberCreateDialog onClose={() => setCreating(false)} onCreated={(created) => { setCreating(false); setNotice('本地成员已创建，首次登录需设置新密码'); queryClient.setQueryData(['member', created.member.id], created); void queryClient.invalidateQueries({ queryKey: ['members', 'list'] }); }} /> : null}
      {importing ? <LdapMemberImportDialog onClose={() => setImporting(false)} onImported={(result) => { setImporting(false); setNotice(result.created ? 'LDAP 成员已导入' : '该 LDAP 成员已存在'); void queryClient.invalidateQueries({ queryKey: ['members', 'list'] }); }} /> : null}
    </div>
  );
}
