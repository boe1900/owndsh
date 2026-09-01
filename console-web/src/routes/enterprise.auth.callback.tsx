/**
 * [INPUT]: 依赖一次性 PKCE 回调交换、标签页 Token 写入与安全 returnTo。
 * [OUTPUT]: 提供登录完成中的等待态和失败重试入口。
 * [POS]: routes 的公开认证回调，成功后以 replace 清除浏览器历史中的 code/state。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { completeEnterpriseAdminLogin } from '@/auth/pkce';
import { setToken } from '@/auth/session';

export const Route = createFileRoute('/enterprise/auth/callback')({
  component: EnterpriseAuthCallbackPage
});

function EnterpriseAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();

  useEffect(() => {
    completeEnterpriseAdminLogin(window.location.search)
      .then(({ token, returnTo }) => {
        setToken(token);
        window.location.replace(returnTo);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'ENT_AUTH_CODE_INVALID');
      });
  }, []);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-page p-6 text-ink">
      {error ? (
        <div className="text-center">
          <h1 className="text-xl font-semibold">企业登录失败</h1>
          <p className="mt-2 text-[13px] text-red">{error}</p>
          <button type="button" onClick={() => void navigate({ to: '/login', replace: true })} className="mt-5 inline-flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[13px] font-medium text-canvas">
            <RotateCcw size={15} />重新登录
          </button>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-2 text-[13px] text-ink-2">
          <LoaderCircle size={17} className="animate-spin" />正在完成企业登录...
        </div>
      )}
    </main>
  );
}
