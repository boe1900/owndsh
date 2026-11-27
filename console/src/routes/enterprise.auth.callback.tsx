/**
 * [INPUT]: 依赖共享 PKCE 完成器的 Cookie 交换、安全内部返回路径、原客户端事务续授与 coss UI Button/Spinner/Alert。
 * [OUTPUT]: 提供登录完成中的等待态和失败重试入口。
 * [POS]: routes 的公开认证回调，成功后以 replace 清除浏览器历史中的 code/state。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { completeEnterpriseAdminLogin } from '@/auth/pkce';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export const Route = createFileRoute('/enterprise/auth/callback')({
  component: EnterpriseAuthCallbackPage
});

function EnterpriseAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();

  useEffect(() => {
    completeEnterpriseAdminLogin(window.location.search)
      .then(({ returnTo }) => window.location.replace(returnTo))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'ENT_AUTH_CODE_INVALID');
      });
  }, []);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
      {error ? (
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">企业登录失败</h1>
          <Alert variant="error" className="mt-4 text-left">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button type="button" className="mt-5" onClick={() => void navigate({ to: '/login', replace: true })}>
            <RotateCcw aria-hidden />
            重新登录
          </Button>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <span>正在完成企业登录...</span>
        </div>
      )}
    </main>
  );
}
