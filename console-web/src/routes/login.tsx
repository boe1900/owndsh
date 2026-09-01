/**
 * [INPUT]: 依赖 shadcn authentication 双栏外壳、Beautiful UI tokens 与 enterprise-admin PKCE 起点。
 * [OUTPUT]: 提供不收集用户凭据的产品登录页，并安全保留内部 returnTo。
 * [POS]: routes 的公开登录入口，只复用认证模板构图，身份源选择与凭据验证仍由 Server 承担。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Command, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { normalizeReturnTo, startEnterpriseAdminLogin } from '@/auth/pkce';

type LoginSearch = { redirect?: string };

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? normalizeReturnTo(search.redirect) : undefined
  }),
  component: LoginPage
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const signIn = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      await startEnterpriseAdminLogin(redirect);
    } catch {
      setSubmitting(false);
      setError('无法打开企业登录，请检查服务后重试。');
    }
  };

  return (
    <main className="grid min-h-[100dvh] bg-page text-ink lg:grid-cols-2">
      <section className="relative hidden flex-col overflow-hidden bg-canvas p-10 lg:flex">
        <div className="absolute inset-0 bg-ink/[0.025]" />
        <div className="relative z-10 flex items-center gap-2 text-[15px] font-semibold">
          <Command size={22} strokeWidth={2} />
          Enterprise Agent Platform
        </div>
        <blockquote className="relative z-10 mt-auto max-w-lg text-[16px] leading-7 text-ink-2">
          “让团队在同一套身份、模型与策略下使用 Agent，同时保留客户端的原生能力。”
        </blockquote>
      </section>

      <section className="flex min-h-[100dvh] items-center justify-center px-6 py-12 lg:p-8">
        <div className="flex w-full max-w-[350px] flex-col gap-6">
          <div className="flex items-center justify-center gap-2 text-[14px] font-semibold lg:hidden">
            <Command size={20} strokeWidth={2} />
            Enterprise Agent Platform
          </div>
          <div className="text-center">
            <h1 className="text-[24px] font-semibold leading-tight">登录管理控制台</h1>
            <p className="mt-2 text-[14px] leading-6 text-ink-2">使用组织已配置的身份源继续</p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={signIn}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-ink px-4 text-[13px] font-medium text-canvas shadow-btn transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {submitting ? '正在进入企业登录...' : '使用企业身份登录'}
          </button>
          {error && <p role="alert" className="mt-3 text-[13px] text-red">{error}</p>}
          <p className="px-6 text-center text-[12px] leading-5 text-ink-3">登录状态仅在当前标签页有效</p>
        </div>
      </section>
    </main>
  );
}
