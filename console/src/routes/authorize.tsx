/**
 * [INPUT]: 依赖浏览器账号、既有桌面事务 sources/CSRF 与共享的客户端授权边界。
 * [OUTPUT]: 提供当前账号确认、浏览器账号切换与一次性客户端授权，未登录恢复同一个桌面事务。
 * [POS]: routes 的公开授权页，独立于控制台角色门禁；没有凭据表单或客户端 Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { listPublicIdentitySources } from '@/api/generated/sdk.gen';
import type { AuthSourcesData, BrowserMember } from '@/api/generated/types.gen';
import { AuthLayout } from '@/auth/auth-layout';
import { decideClientAuthorization, loadBrowserIdentity } from '@/auth/browser';
import { AuthRequiredError, logoutCurrentSession } from '@/auth/session';

export const Route = createFileRoute('/authorize')({
  validateSearch: (search: Record<string, unknown>) => ({
    transaction_id: typeof search.transaction_id === 'string' ? search.transaction_id : ''
  }),
  component: AuthorizePage
});

function AuthorizePage() {
  const { transaction_id } = Route.useSearch();
  const navigate = useNavigate();
  const [member, setMember] = useState<BrowserMember>();
  const [auth, setAuth] = useState<AuthSourcesData>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const returnTo = `/authorize?transaction_id=${encodeURIComponent(transaction_id)}`;

  useEffect(() => {
    let active = true;
    setMember(undefined);
    setAuth(undefined);
    setError(undefined);
    if (!transaction_id) { setError('登录请求无效，请返回 OwnDsh 重新登录。'); return; }
    void Promise.all([
      loadBrowserIdentity(),
      listPublicIdentitySources({ query: { transaction_id } }).then(result => {
        if (result.error || !result.data) throw new Error('ENT_AUTH_SESSION_EXPIRED');
        return result.data.data;
      })
    ]).then(([account, transaction]) => {
      if (active) { setMember(account); setAuth(transaction); }
    }).catch(reason => {
      if (!active) return;
      if (reason instanceof AuthRequiredError) {
        void navigate({ to: '/login', search: { redirect: returnTo }, replace: true });
      } else setError('登录请求已过期或服务暂不可用，请返回 OwnDsh 重新登录。');
    });
    return () => { active = false; };
  }, [transaction_id, returnTo, navigate]);

  const decide = async (approved: boolean) => {
    if (!auth || !member || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      window.location.assign(await decideClientAuthorization(auth, member, approved));
    } catch (reason) {
      if (reason instanceof AuthRequiredError) {
        void navigate({ to: '/login', search: { redirect: returnTo }, replace: true });
      } else setError('授权未能完成，请返回 OwnDsh 重新登录。');
      setBusy(false);
    }
  };

  const switchAccount = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logoutCurrentSession();
      await navigate({ to: '/login', search: { redirect: returnTo }, replace: true });
    } catch { setError('切换账号失败，请重试。'); setBusy(false); }
  };

  return <AuthLayout>
    <h1 className="text-center text-[24px] font-semibold">登录 OwnDsh</h1>
    {member && auth ? <>
      <p className="mt-4 text-center text-[13px] leading-6 text-ink-2">使用以下账号登录客户端</p>
      <div className="mt-6 rounded-[8px] border border-line bg-inset px-4 py-3">
        <p className="text-[14px] font-medium">{member.displayName}</p>
        <p className="mt-1 text-[12px] text-ink-3">{member.username}</p>
      </div>
      <button disabled={busy} onClick={() => void decide(true)} className="mt-5 h-10 rounded-[8px] bg-ink text-[13px] font-medium text-canvas disabled:opacity-50">
        {busy ? '正在处理…' : `以 ${member.username} 继续`}
      </button>
      <button disabled={busy} onClick={() => void switchAccount()} className="mt-4 text-[13px] text-ink-2 underline">切换其他账号</button>
      <button disabled={busy} onClick={() => void decide(false)} className="mt-4 text-[13px] text-ink-3">取消登录</button>
      <p className="mt-6 text-center text-[12px] leading-5 text-ink-3">请确认本次登录由你在可信的 OwnDsh 客户端发起。</p>
    </> : !error && <p role="status" className="mt-6 text-center text-[13px] text-ink-2">正在读取登录请求…</p>}
    {error && <p role="alert" className="mt-4 text-center text-[13px] text-red">{error}</p>}
  </AuthLayout>;
}
