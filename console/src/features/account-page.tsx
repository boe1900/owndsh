/**
 * [INPUT]: 依赖 console bootstrap 当前账号、固定角色、当前用户改密动作、TanStack 子路由与 coss UI Dialog/Tabs/ScrollArea/Button/Avatar/Badge/Field/Input/Alert 原生组件。
 * [OUTPUT]: 提供复用的个人资料/改密内容模块、原生 coss UI 左右分栏弹窗版用户中心 `AccountDialog`（760×560 比例、左 208px 纵向 Tabs 与右侧固定顶栏滚动内容），以及面向无管理页员工兜底的 `/account` 子页面（AccountLayout/AccountProfilePage/AccountSecurityPage）。
 * [POS]: features 的当前用户自助入口；日常通过左下角头像菜单在当前页以弹窗呈现，不打断工作区且不为管理员额外增加标签页。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Link, Outlet, useNavigate, useRouteContext, useRouterState } from '@tanstack/react-router';
import { KeyRound, UserRound } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { AuthBuiltInRole, EnterpriseErrorResponse } from '@/api/generated/types.gen';
import { changeCurrentPassword } from '@/auth/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<AuthBuiltInRole, string> = {
  enterprise_admin: '企业管理员',
  model_admin: '模型管理员',
  plugin_admin: '插件管理员',
  auditor: '审计员',
  employee: '成员'
};

const SOURCE_LABELS = { LOCAL: '本地', LDAP: 'LDAP', OIDC: 'OIDC' } as const;

export function AccountDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [sessionKey, setSessionKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // 关闭后复位为“基本信息”并递增会话键，清空未提交密码草稿
      setActiveTab('profile');
      setSessionKey((current) => current + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup
        className="h-[min(560px,88vh)] overflow-hidden p-0 sm:max-w-[760px]"
        closeProps={{ className: 'absolute end-3 top-2.5' }}
      >
        <Tabs
          key={sessionKey}
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => {
            if (value === 'profile' || value === 'security') {
              setActiveTab(value);
            }
          }}
          className="min-h-0 flex-1 flex-col gap-0 data-[orientation=vertical]:flex-col sm:data-[orientation=vertical]:flex-row"
        >
          <aside className="flex w-full shrink-0 flex-col border-b bg-muted/40 p-3.5 sm:w-[208px] sm:border-r sm:border-b-0 sm:p-4">
            <DialogHeader className="mb-3 gap-0.5 p-0 px-1 text-left sm:mb-4">
              <DialogTitle className="text-[15px] font-semibold tracking-tight leading-snug">
                用户中心
              </DialogTitle>
              <DialogDescription className="hidden text-xs sm:block">
                管理账号资料与登录安全
              </DialogDescription>
            </DialogHeader>

            <TabsList
              variant="default"
              className="w-full gap-1 bg-transparent p-0 data-[orientation=vertical]:flex-row sm:data-[orientation=vertical]:flex-col sm:data-[orientation=vertical]:px-0"
            >
              <TabsTab
                value="profile"
                className="justify-center gap-2 px-3 py-2 sm:data-[orientation=vertical]:justify-start"
              >
                <UserRound aria-hidden className="size-4 shrink-0" />
                <span>基本信息</span>
              </TabsTab>
              <TabsTab
                value="security"
                className="justify-center gap-2 px-3 py-2 sm:data-[orientation=vertical]:justify-start"
              >
                <KeyRound aria-hidden className="size-4 shrink-0" />
                <span>安全设置</span>
              </TabsTab>
            </TabsList>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <div className="flex h-[54px] shrink-0 items-center border-b px-5 pr-12 sm:px-6 sm:pr-12">
              <h3 className="m-0 truncate text-sm font-semibold text-foreground">
                {activeTab === 'profile' ? '基本信息' : '安全设置'}
              </h3>
            </div>

            <ScrollArea overscrollContain scrollFade className="min-h-0 flex-1">
              <div className="px-5 py-5 sm:px-6">
                <TabsPanel value="profile">
                  <AccountProfileContent compact />
                </TabsPanel>
                <TabsPanel value="security">
                  <AccountSecurityContent compact onSuccess={() => handleOpenChange(false)} />
                </TabsPanel>
              </div>
            </ScrollArea>
          </section>
        </Tabs>
      </DialogPopup>
    </Dialog>
  );
}

export function AccountLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-stable">
      <div className="mx-auto w-full max-w-[1080px] px-5 py-6 sm:px-8 sm:py-7">
        <header className="border-b pb-5">
          <h1 className="m-0 font-heading text-xl font-semibold tracking-tight leading-tight text-foreground">用户中心</h1>
        </header>

        <div className="grid gap-8 py-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <nav aria-label="用户中心分区" className="flex gap-1 md:sticky md:top-6 md:flex-col md:self-start">
            <AccountNavLink active={pathname === '/account'} icon={<UserRound size={16} />} label="基本信息" to="/account" />
            <AccountNavLink active={pathname === '/account/security'} icon={<KeyRound size={16} />} label="安全设置" to="/account/security" />
          </nav>
          <div className="min-w-0"><Outlet /></div>
        </div>
      </div>
    </div>
  );
}

export function AccountProfilePage() {
  return <AccountProfileContent />;
}

export function AccountSecurityPage() {
  return <AccountSecurityContent />;
}

function AccountProfileContent({ compact = false }: { compact?: boolean }) {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const member = bootstrap.member;
  const initial = member.displayName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <section>
      {compact ? null : <h2 className="mb-5 mt-0 text-base font-semibold">基本信息</h2>}
      <div className="mb-4 flex items-center gap-3">
        <Avatar className="[--avatar-size:3rem]">
          {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-info/12 font-semibold text-info-foreground">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{member.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">@{member.username}</div>
        </div>
      </div>
      <dl className="m-0 divide-y border-y text-sm">
        <AccountFact compact={compact} label="显示名称" value={member.displayName} />
        <AccountFact compact={compact} label="用户名" value={member.username} />
        <AccountFact compact={compact} label="邮箱" value={member.email ?? '未设置'} />
        <AccountFact compact={compact} label="角色" value={bootstrap.roles.map((role) => ROLE_LABELS[role]).join('、')} />
        <AccountFact
          compact={compact}
          label="登录方式"
          value={(
            <div className="flex flex-wrap gap-1.5">
              {member.loginMethods.map((method) => (
                <Badge key={`${method.sourceType}:${method.sourceName}`} variant="outline">
                  {SOURCE_LABELS[method.sourceType]} · {method.sourceName}
                </Badge>
              ))}
            </div>
          )}
        />
        <AccountFact compact={compact} label="成员 ID" value={member.id} mono />
      </dl>
    </section>
  );
}

function AccountSecurityContent({
  compact = false,
  onSuccess
}: {
  compact?: boolean;
  onSuccess?: () => void;
}) {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await changeCurrentPassword(currentPassword, newPassword);
      onSuccess?.();
      await navigate({ to: '/login', replace: true });
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'error' in cause) {
        setError((cause as EnterpriseErrorResponse).error?.message ?? '密码修改失败');
      } else {
        setError(cause instanceof Error && cause.message ? cause.message : '密码修改失败');
      }
      setSaving(false);
    }
  };

  return (
    <section>
      {compact ? null : <h2 className="mb-5 mt-0 text-base font-semibold">修改密码</h2>}
      <form
        className={cn('grid gap-4', compact ? 'w-full' : 'max-w-[520px]')}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field>
          <FieldLabel>当前密码</FieldLabel>
          <Input required autoComplete="current-password" maxLength={256} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel>新密码</FieldLabel>
          <Input required autoComplete="new-password" maxLength={128} minLength={14} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel>确认新密码</FieldLabel>
          <Input required autoComplete="new-password" maxLength={128} minLength={14} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </Field>
        {error ? (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className={compact ? 'flex justify-end pt-1' : undefined}>
          <Button type="submit" disabled={saving}>{saving ? '保存中' : '修改密码'}</Button>
        </div>
      </form>
    </section>
  );
}

function AccountNavLink({ active, icon, label, to }: { active: boolean; icon: ReactNode; label: string; to: '/account' | '/account/security' }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {icon}{label}
    </Link>
  );
}

function AccountFact({
  compact = false,
  label,
  value,
  mono = false
}: {
  compact?: boolean;
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className={cn('grid gap-1 py-2.5 sm:gap-4', compact ? 'sm:grid-cols-[104px_minmax(0,1fr)]' : 'py-3 sm:grid-cols-[140px_minmax(0,1fr)]')}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`m-0 min-w-0 break-words ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
