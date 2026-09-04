/**
 * [INPUT]: 依赖 console bootstrap 当前账号、固定角色、当前用户改密动作与 TanStack 子路由。
 * [OUTPUT]: 提供 shadcn Settings 结构的用户中心布局、基本信息页与安全设置页。
 * [POS]: features 的当前用户自助入口，以独立子页面隔离账号事实展示和本人密码操作。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Link, Outlet, useNavigate, useRouteContext, useRouterState } from '@tanstack/react-router';
import { KeyRound, UserRound } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { AuthBuiltInRole, EnterpriseErrorResponse } from '@/api/generated/types.gen';
import { changeCurrentPassword } from '@/auth/session';
import { Button } from '@/components/atoms/Button';

const ROLE_LABELS: Record<AuthBuiltInRole, string> = {
  enterprise_admin: '企业管理员',
  model_admin: '模型管理员',
  plugin_admin: '插件管理员',
  auditor: '审计员',
  employee: '成员'
};

const SOURCE_LABELS = { LOCAL: '本地', LDAP: 'LDAP', OIDC: 'OIDC' } as const;

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint';

export function AccountLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1080px] px-5 py-7 sm:px-8 sm:py-9">
        <header className="border-b border-line pb-5">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">用户中心</h1>
        </header>

        <div className="grid gap-8 py-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <nav aria-label="用户中心分区" className="flex gap-1 md:sticky md:top-6 md:block md:self-start">
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
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const member = bootstrap.member;
  const initial = member.displayName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <section>
      <h2 className="mb-5 mt-0 text-[16px] font-semibold text-ink">基本信息</h2>
      <div className="mb-5 flex items-center gap-3">
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <div aria-hidden className="flex size-12 items-center justify-center rounded-full bg-accent-tint text-[16px] font-semibold text-accent">{initial}</div>
        )}
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink">{member.displayName}</div>
          <div className="truncate text-[12.5px] text-ink-3">@{member.username}</div>
        </div>
      </div>
      <dl className="m-0 divide-y divide-line border-y border-line text-[13px]">
        <AccountFact label="显示名称" value={member.displayName} />
        <AccountFact label="用户名" value={member.username} />
        <AccountFact label="邮箱" value={member.email ?? '未设置'} />
        <AccountFact label="角色" value={bootstrap.roles.map((role) => ROLE_LABELS[role]).join('、')} />
        <AccountFact label="登录方式" value={(
          <div className="flex flex-wrap gap-1.5">
            {member.loginMethods.map((method) => (
              <span key={`${method.sourceType}:${method.sourceName}`} className="rounded-[6px] border border-line bg-surface px-2 py-1 text-[12px] text-ink-2">
                {SOURCE_LABELS[method.sourceType]} · {method.sourceName}
              </span>
            ))}
          </div>
        )} />
        <AccountFact label="成员 ID" value={member.id} mono />
      </dl>
    </section>
  );
}

export function AccountSecurityPage() {
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
      <h2 className="mb-5 mt-0 text-[16px] font-semibold text-ink">修改密码</h2>
      <form className="grid max-w-[520px] gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink">
          当前密码
          <input required autoComplete="current-password" className={inputClass} maxLength={256} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink">
          新密码
          <input required autoComplete="new-password" className={inputClass} maxLength={128} minLength={14} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink">
          确认新密码
          <input required autoComplete="new-password" className={inputClass} maxLength={128} minLength={14} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
        {error ? <p role="alert" className="m-0 text-[12.5px] text-red">{error}</p> : null}
        <div>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? '保存中' : '修改密码'}</Button>
        </div>
      </form>
    </section>
  );
}

function AccountNavLink({ active, icon, label, to }: { active: boolean; icon: ReactNode; label: string; to: '/account' | '/account/security' }) {
  return (
    <Link to={to} className={`flex items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium md:mt-1 ${
      active ? 'bg-hover-2 text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'
    }`}>
      {icon}{label}
    </Link>
  );
}

function AccountFact({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className={`m-0 min-w-0 break-words text-ink ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </div>
  );
}
