/**
 * [INPUT]: 依赖 shadcn authentication 双栏外壳、Beautiful UI tokens、OwnDsh 鲸鱼品牌资源、公开身份源和 enterprise-admin Cookie 登录状态机。
 * [OUTPUT]: 提供动态沉浸式鲸鱼品牌宣言、LOCAL/LDAP Tab、OIDC 按钮、验证码及首次改密均留在产品内的管理端登录页。
 * [POS]: routes 的公开第一方登录入口，只有 OIDC 离开当前页面，登录结果只建立服务端 HttpOnly Cookie。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { Eye, EyeOff, KeyRound, LoaderCircle, LogIn, RefreshCw } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { completePasswordLogin } from '@/api/generated/sdk.gen';
import type { AuthSourcesData, PasswordStepData, PublicIdentitySource } from '@/api/generated/types.gen';
import { completeEnterpriseAdminLogin, normalizeReturnTo, startEnterpriseAdminLogin } from '@/auth/pkce';
import { ThemeToggle } from '@/components/site/ThemeToggle';

type LoginSearch = { redirect?: string };
type Captcha = { id: string; image: string };
type PasswordChange = { challenge: string; rejected: boolean };

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? normalizeReturnTo(search.redirect) : undefined
  }),
  component: LoginPage
});

function passwordStepOf(payload: unknown): PasswordStepData | undefined {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return undefined;
  const data = payload.data;
  if (!data || typeof data !== 'object' || !('next' in data)) return undefined;
  return data as PasswordStepData;
}

function errorCodeOf(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return undefined;
  const error = payload.error;
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
}

function sourceLabel(source: PublicIdentitySource) {
  return source.type === 'LOCAL' ? '本地账户' : source.name;
}

function LoginPage() {
  const { redirect } = Route.useSearch();
  const started = useRef(false);
  const [auth, setAuth] = useState<AuthSourcesData>();
  const [selectedSource, setSelectedSource] = useState<PublicIdentitySource>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha>();
  const [captchaCode, setCaptchaCode] = useState('');
  const [passwordChange, setPasswordChange] = useState<PasswordChange>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const refreshCaptcha = async () => {
    setCaptcha(undefined);
    setCaptchaCode('');
    const response = await fetch('/auth/code', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('ENT_PLATFORM_UNAVAILABLE');
    const payload = await response.json() as {
      data?: { captchaEnabled?: boolean; uuid?: string; img?: string };
    };
    if (payload.data?.captchaEnabled) {
      if (!payload.data.uuid || !payload.data.img) throw new Error('ENT_PLATFORM_UNAVAILABLE');
      setCaptcha({ id: payload.data.uuid, image: payload.data.img });
    }
  };

  const choosePasswordSource = (source: PublicIdentitySource) => {
    setSelectedSource(source);
    setPassword('');
    setPasswordChange(undefined);
    setNewPassword('');
    setConfirmPassword('');
    setError(undefined);
    if (source.type === 'LOCAL') {
      void refreshCaptcha().catch(() => setError('验证码加载失败，请重试。'));
    } else {
      setCaptcha(undefined);
      setCaptchaCode('');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startEnterpriseAdminLogin(redirect)
      .then((data) => {
        setAuth(data);
        const firstPasswordSource = data.sources.find((source) => source.type !== 'OIDC');
        if (firstPasswordSource) choosePasswordSource(firstPasswordSource);
      })
      .catch(() => setError('暂时无法连接企业服务，请刷新后重试。'));
  }, [redirect]);

  const finishLogin = async (redirectUri: string) => {
    const callback = new URL(redirectUri, window.location.origin);
    const completed = await completeEnterpriseAdminLogin(callback.search);
    window.location.replace(completed.returnTo);
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth || !selectedSource) return;
    if (passwordChange) {
      const strong = newPassword.length >= 14
        && /[a-z]/.test(newPassword)
        && /[A-Z]/.test(newPassword)
        && /[0-9]/.test(newPassword)
        && /[^A-Za-z0-9]/.test(newPassword);
      if (newPassword !== confirmPassword || !strong) {
        setError(newPassword !== confirmPassword ? '两次输入的新密码不一致。' : '新密码不符合安全要求。');
        return;
      }
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const result = await completePasswordLogin({
        body: passwordChange ? {
          transactionId: auth.transactionId,
          sourceId: selectedSource.id,
          csrfToken: auth.csrfToken,
          passwordChangeChallenge: passwordChange.challenge,
          newPassword
        } : {
          transactionId: auth.transactionId,
          sourceId: selectedSource.id,
          csrfToken: auth.csrfToken,
          username,
          password,
          ...(captcha ? { captchaId: captcha.id, captchaCode } : {})
        },
        headers: { Accept: 'application/json' }
      });
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');

      const step = passwordStepOf(result.response?.status === 409 ? result.error : result.data);
      if (result.response?.status === 409 && step?.next === 'CHANGE_PASSWORD'
        && step.passwordChangeChallenge) {
        setPasswordChange({ challenge: step.passwordChangeChallenge, rejected: step.rejected });
        setUsername('');
        setCaptcha(undefined);
        setCaptchaCode('');
        setError(step.rejected ? '新密码不符合安全要求，请重新输入。' : undefined);
        return;
      }
      if (result.error !== undefined) {
        const code = errorCodeOf(result.error);
        if (code === 'ENT_AUTH_REQUIRED') {
          setError('账号、密码或验证码不正确，请重试。');
          if (selectedSource.type === 'LOCAL') await refreshCaptcha();
        } else if (code === 'ENT_AUTH_SESSION_EXPIRED') {
          setError('登录已过期，请刷新页面后重试。');
        } else {
          setError('登录失败，请重试。');
        }
        return;
      }
      if (step?.next !== 'REDIRECT' || !step.redirectUri) throw new Error('ENT_AUTH_CODE_INVALID');
      await finishLogin(step.redirectUri);
    } catch {
      setError('登录失败，请检查服务后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  const passwordSources = auth?.sources.filter((source) => source.type !== 'OIDC') ?? [];
  const oidcSources = auth?.sources.filter((source) => source.type === 'OIDC') ?? [];

  return (
    <main className="grid min-h-[100dvh] bg-page text-ink lg:grid-cols-2">
      <section className="relative hidden flex-col overflow-hidden bg-[#081523] p-10 text-white lg:flex">
        <img
          src="/owndsh-whale-bg-navy.png"
          alt=""
          className="login-brand-art pointer-events-none absolute inset-0 size-full object-cover object-center"
        />
        <div aria-hidden className="login-brand-grid pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex items-center gap-2 text-[15px] font-semibold">
          <img src="/owndsh-whale-mono-m2-animated.png" alt="" className="size-[22px] rounded-[6px] object-cover ring-1 ring-white/10" />
          OwnDsh
        </div>
        <div className="relative z-10 my-auto max-w-[560px]">
          <h2 className="text-balance text-[34px] font-semibold leading-[1.18]">
            OwnDsh · Truly Own Your DeepSeek-Harness.
          </h2>
          <p className="mt-5 text-[15px] italic leading-6 text-white/65">
            The Self-Hosted Control Plane for DeepSeek-Harness.
          </p>
          <div className="mt-8 space-y-1 text-[17px] leading-7 text-white/85">
            <p>真正拥有属于你的 DeepSeek-Harness。</p>
            <p>DeepSeek-Harness 的私有化控制面。</p>
          </div>
        </div>
        <div className="relative z-10 text-white/55">
          <p className="text-[13px] font-medium">OwnDsh Console</p>
          <p className="mt-1 text-[16px] font-medium text-white/75">企业工作区</p>
        </div>
      </section>

      <section className="relative flex min-h-[100dvh] items-center justify-center px-6 py-16 lg:p-8">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <div className="flex w-full max-w-[410px] flex-col">
          <div className="mb-8 flex items-center justify-center gap-2 text-[14px] font-semibold lg:hidden">
            <img src="/owndsh-whale-mono-m2-animated.png" alt="" className="size-5 rounded-[6px] object-cover" />
            OwnDsh
          </div>
          <div className="text-center">
            <img src="/owndsh-whale-mono-m2-animated.png" alt="" className="mx-auto size-11 rounded-[10px] object-cover shadow-btn" />
            <h1 className="mt-5 text-[24px] font-semibold leading-tight">登录管理控制台</h1>
          </div>

          {!auth && !error && (
            <div role="status" className="mt-8 flex h-10 items-center justify-center gap-2 text-[13px] text-ink-2">
              <LoaderCircle size={16} className="animate-spin" />正在载入登录方式...
            </div>
          )}

          {passwordSources.length > 1 && (
            <div role="tablist" aria-label="登录方式" className="mt-8 flex overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {passwordSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedSource?.id === source.id}
                  disabled={submitting || Boolean(passwordChange)}
                  onClick={() => choosePasswordSource(source)}
                  className={`relative min-w-28 flex-1 px-3 pb-3 text-[13px] font-medium transition-colors disabled:pointer-events-none ${
                    selectedSource?.id === source.id ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {sourceLabel(source)}
                  {selectedSource?.id === source.id && <span className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-accent" />}
                </button>
              ))}
            </div>
          )}

          {selectedSource && (
            <form className={passwordSources.length > 1 ? 'mt-6' : 'mt-8'} onSubmit={submitPassword}>
              {passwordChange ? (
                <div className="space-y-4">
                  <div className="rounded-[8px] border border-line bg-inset px-3 py-2.5 text-[12px] leading-5 text-ink-2">
                    首次登录必须设置新密码。密码至少 14 位，并包含大小写字母、数字和符号。
                  </div>
                  <label className="block text-[13px] font-medium">
                    新密码
                    <input
                      required type="password" autoComplete="new-password" minLength={14} maxLength={128}
                      placeholder="请输入新密码"
                      value={newPassword} onChange={(event) => setNewPassword(event.target.value)}
                      className="mt-2 h-10 w-full rounded-[8px] border border-line-strong bg-field px-3 text-[14px] outline-none shadow-inset-field transition-colors focus:border-accent"
                    />
                  </label>
                  <label className="block text-[13px] font-medium">
                    确认新密码
                    <input
                      required type="password" autoComplete="new-password" minLength={14} maxLength={128}
                      placeholder="请再次输入新密码"
                      value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-2 h-10 w-full rounded-[8px] border border-line-strong bg-field px-3 text-[14px] outline-none shadow-inset-field transition-colors focus:border-accent"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-[13px] font-medium">
                    用户名
                    <input
                      required autoFocus autoComplete="username" maxLength={100}
                      placeholder="请输入企业账号"
                      value={username} onChange={(event) => setUsername(event.target.value)}
                      className="mt-2 h-10 w-full rounded-[8px] border border-line-strong bg-field px-3 text-[14px] outline-none shadow-inset-field transition-colors focus:border-accent"
                    />
                  </label>
                  <label className="block text-[13px] font-medium">
                    密码
                    <span className="relative mt-2 block">
                      <input
                        required type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={256}
                        placeholder="请输入登录密码"
                        value={password} onChange={(event) => setPassword(event.target.value)}
                        className="h-10 w-full rounded-[8px] border border-line-strong bg-field px-3 pr-10 text-[14px] outline-none shadow-inset-field transition-colors focus:border-accent"
                      />
                      <button
                        type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'}
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-3 transition-colors hover:text-ink"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </label>
                  {captcha && (
                    <div className="grid grid-cols-[minmax(0,1fr)_124px] items-end gap-2">
                      <label className="block text-[13px] font-medium">
                        验证码
                        <input
                          required autoComplete="off" maxLength={16}
                          placeholder="请输入验证码"
                          value={captchaCode} onChange={(event) => setCaptchaCode(event.target.value)}
                          className="mt-2 h-10 w-full rounded-[8px] border border-line-strong bg-field px-3 text-[14px] outline-none shadow-inset-field transition-colors focus:border-accent"
                        />
                      </label>
                      <button
                        type="button" title="刷新验证码" aria-label="刷新验证码"
                        onClick={() => void refreshCaptcha().catch(() => setError('验证码加载失败，请重试。'))}
                        className="relative h-10 overflow-hidden rounded-[8px] border border-line-strong bg-surface"
                      >
                        <img src={`data:image/gif;base64,${captcha.image}`} alt="验证码" className="size-full object-cover" />
                        <RefreshCw size={13} className="absolute right-1 top-1 text-ink-2" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit" disabled={submitting}
                className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-ink px-4 text-[13px] font-medium text-canvas shadow-btn transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />}
                {submitting ? '正在登录...' : passwordChange ? '设置密码并登录' : '登录'}
              </button>
            </form>
          )}

          {oidcSources.length > 0 && auth && !passwordChange && (
            <div className={selectedSource ? 'mt-7' : 'mt-8'}>
              {selectedSource && (
                <div className="mb-4 flex items-center gap-3 text-[12px] text-ink-3">
                  <span className="h-px flex-1 bg-line" />其他登录方式<span className="h-px flex-1 bg-line" />
                </div>
              )}
              <div className="space-y-2">
                {oidcSources.map((source) => (
                  <button
                    key={source.id} type="button" disabled={submitting}
                    onClick={() => window.location.assign(`/enterprise/auth/v1/oidc/${encodeURIComponent(source.id)}/start?transaction_id=${encodeURIComponent(auth.transactionId)}`)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-line-strong bg-surface px-4 text-[13px] font-medium text-ink shadow-btn transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
                  >
                    <KeyRound size={16} />使用 {source.name} 登录
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-4 text-center text-[13px] leading-5 text-red">{error}</p>}
        </div>
      </section>
    </main>
  );
}
