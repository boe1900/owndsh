/**
 * [INPUT]: 依赖共享认证布局、公开身份源、浏览器 PKCE/Cookie 状态机、独立浏览器身份查询与 coss UI Tabs/Input/Button/Alert/Spinner。
 * [OUTPUT]: 提供动态沉浸式鲸鱼品牌宣言、LOCAL/LDAP Tab、OIDC 按钮、验证码及首次改密均留在产品内的统一账号登录页。
 * [POS]: routes 的唯一凭据页；新鲜浏览器登录经共享 PKCE 完成器续授原客户端事务，身份绑定仍回到既有回调。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, KeyRound, LogIn, RefreshCw } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { completePasswordLogin, listPublicIdentitySources } from '@/api/generated/sdk.gen';
import type { AuthSourcesData, PasswordStepData, PublicIdentitySource } from '@/api/generated/types.gen';
import { AuthLayout } from '@/auth/auth-layout';
import { loadBrowserIdentity } from '@/auth/browser';
import { completeEnterpriseAdminLogin, normalizeReturnTo, startEnterpriseAdminLogin } from '@/auth/pkce';
import { AuthRequiredError } from '@/auth/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';

type LoginSearch = { redirect?: string; transaction_id?: string; source_id?: string; login_error?: string };
type Captcha = { id: string; image: string };
type PasswordChange = { challenge: string; rejected: boolean };

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? normalizeReturnTo(search.redirect) : undefined,
    transaction_id: typeof search.transaction_id === 'string' ? search.transaction_id : undefined,
    source_id: typeof search.source_id === 'string' ? search.source_id : undefined,
    login_error: search.login_error === '1' ? '1' : undefined
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
  const { redirect, transaction_id, source_id, login_error } = Route.useSearch();
  const navigate = useNavigate();
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
    } else {
      setCaptcha(undefined);
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
    if (transaction_id) {
      void listPublicIdentitySources({ query: { transaction_id } }).then((result) => {
        if (!result.data || result.error) throw new Error('ENT_AUTH_SESSION_EXPIRED');
        setAuth(result.data.data);
        const source = result.data.data.sources.find(item => item.id === source_id)
          ?? result.data.data.sources.find(item => item.type !== 'OIDC');
        if (source) choosePasswordSource(source);
        if (login_error) setError('账号、密码或验证码不正确，请重试。');
      }).catch(() => setError('登录请求已过期，请返回发起页面重新操作。'));
      return;
    }
    loadBrowserIdentity()
      .then(() => navigate({ href: redirect ?? '/', replace: true }))
      .catch((reason: unknown) => {
        if (!(reason instanceof AuthRequiredError)) {
          setError('暂时无法连接企业服务，请刷新后重试。');
          return;
        }
        return startEnterpriseAdminLogin(redirect).then((data) => {
          setAuth(data);
          const firstPasswordSource = data.sources.find((source) => source.type !== 'OIDC');
          if (firstPasswordSource) choosePasswordSource(firstPasswordSource);
        });
      })
      .catch(() => setError('暂时无法连接企业服务，请刷新后重试。'));
  }, [navigate, redirect, transaction_id, source_id, login_error]);

  const finishLogin = async (redirectUri: string) => {
    const callback = new URL(redirectUri, window.location.origin);
    if (transaction_id) {
      if (callback.origin !== window.location.origin
        && !(callback.protocol === 'http:' && callback.hostname === '127.0.0.1' && callback.pathname === '/callback')) {
        throw new Error('ENT_INVALID_REDIRECT_URI');
      }
      window.location.assign(callback.toString());
      return;
    }
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
    <AuthLayout>
      <div className="text-center">
        <img src="/owndsh-whale-mono-m2-animated.png" alt="" className="mx-auto size-11 rounded-[10px] object-cover shadow-xs" />
        <h1 className="mt-5 text-2xl font-semibold leading-tight">登录 OwnDsh 账号</h1>
      </div>

      {!auth && !error ? (
        <div role="status" className="mt-8 flex h-10 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <span>正在载入登录方式...</span>
        </div>
      ) : null}

      {passwordSources.length > 1 && selectedSource ? (
        <Tabs
          className="mt-8"
          value={selectedSource.id}
          onValueChange={(nextId) => {
            if (submitting || passwordChange) return;
            const target = passwordSources.find((item) => item.id === nextId);
            if (target) choosePasswordSource(target);
          }}
        >
          <TabsList aria-label="登录方式" variant="underline" className="w-full border-b">
            {passwordSources.map((source) => (
              <TabsTab
                key={source.id}
                value={source.id}
                disabled={submitting || Boolean(passwordChange)}
                className="flex-1"
              >
                {sourceLabel(source)}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {selectedSource ? (
        <form className={passwordSources.length > 1 ? 'mt-6' : 'mt-8'} onSubmit={submitPassword}>
          {passwordChange ? (
            <div className="space-y-4">
              <Alert variant="info">
                <AlertDescription>
                  首次登录必须设置新密码。密码至少 14 位，并包含大小写字母、数字和符号。
                </AlertDescription>
              </Alert>
              <Field>
                <FieldLabel>新密码</FieldLabel>
                <Input
                  required
                  size="lg"
                  type="password"
                  autoComplete="new-password"
                  minLength={14}
                  maxLength={128}
                  placeholder="请输入新密码"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>确认新密码</FieldLabel>
                <Input
                  required
                  size="lg"
                  type="password"
                  autoComplete="new-password"
                  minLength={14}
                  maxLength={128}
                  placeholder="请再次输入新密码"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="space-y-4">
              <Field>
                <FieldLabel>用户名</FieldLabel>
                <Input
                  required
                  autoFocus
                  size="lg"
                  autoComplete="username"
                  maxLength={100}
                  placeholder="请输入企业账号"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>密码</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    required
                    size="lg"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    maxLength={256}
                    placeholder="请输入登录密码"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </Button>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              {captcha ? (
                <div className="grid grid-cols-[minmax(0,1fr)_124px] items-end gap-2">
                  <Field>
                    <FieldLabel>验证码</FieldLabel>
                    <Input
                      required
                      size="lg"
                      autoComplete="off"
                      maxLength={16}
                      placeholder="请输入验证码"
                      value={captchaCode}
                      onChange={(event) => setCaptchaCode(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    title="刷新验证码"
                    aria-label="刷新验证码"
                    onClick={() => void refreshCaptcha().catch(() => setError('验证码加载失败，请重试。'))}
                    className="relative h-10 overflow-hidden p-0 sm:h-9"
                  >
                    <img src={`data:image/gif;base64,${captcha.image}`} alt="验证码" className="size-full object-cover" />
                    <RefreshCw size={13} className="absolute right-1 top-1 text-muted-foreground" />
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <Button type="submit" size="lg" className="mt-5 w-full" disabled={submitting}>
            {submitting ? <Spinner /> : <LogIn aria-hidden />}
            {submitting ? '正在登录...' : passwordChange ? '设置密码并登录' : '登录'}
          </Button>
        </form>
      ) : null}

      {oidcSources.length > 0 && auth && !passwordChange ? (
        <div className={selectedSource ? 'mt-7' : 'mt-8'}>
          {selectedSource ? (
            <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              <span>其他登录方式</span>
              <Separator className="flex-1" />
            </div>
          ) : null}
          <div className="space-y-2">
            {oidcSources.map((source) => (
              <Button
                key={source.id}
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                disabled={submitting}
                onClick={() => window.location.assign(`/enterprise/auth/v1/oidc/${encodeURIComponent(source.id)}/start?transaction_id=${encodeURIComponent(auth.transactionId)}`)}
              >
                <KeyRound aria-hidden />
                使用 {source.name} 登录
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <Alert variant="error" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </AuthLayout>
  );
}
