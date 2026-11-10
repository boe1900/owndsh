/**
 * [INPUT]: 依赖固定无凭据应用链接和统一认证品牌布局。
 * [OUTPUT]: 提供网页授权交接说明与自动/手动打开 OwnDsh，不提前宣称 Host READY。
 * [POS]: routes 的公开完成页，仅激活窗口，不接收或转发 code、state、Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AuthLayout } from '@/auth/auth-layout';

export const Route = createFileRoute('/authorized')({ component: AuthorizedPage });

function AuthorizedPage() {
  useEffect(() => { window.location.assign('owndsh://open'); }, []);
  return <AuthLayout>
    <h1 className="text-center text-[24px] font-semibold">网页授权已完成</h1>
    <p className="mt-4 text-center text-[13px] leading-6 text-ink-2">OwnDsh 正在完成登录，请返回应用查看结果。</p>
    <a href="owndsh://open" className="mt-8 flex h-10 items-center justify-center rounded-[8px] bg-ink text-[13px] font-medium text-canvas">打开 OwnDsh</a>
    <p className="mt-5 text-center text-[12px] leading-5 text-ink-3">若未自动打开，请手动切回应用。你可以关闭此页面。</p>
  </AuthLayout>;
}
