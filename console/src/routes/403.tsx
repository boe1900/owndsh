/**
 * [INPUT]: 依赖当前 enterprise-admin 会话注销动作、TanStack 登录导航与 coss UI Button/Alert。
 * [OUTPUT]: 提供无控制台角色的明确拒绝页和可验证退出入口。
 * [POS]: routes 的固定角色拒绝边界，不把 employee 误导为网络或登录故障。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LogOut, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { logoutCurrentSession } from '@/auth/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/403')({
  component: ForbiddenPage
});

function ForbiddenPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();

  const signOut = async () => {
    try {
      await logoutCurrentSession();
      await navigate({ to: '/login', replace: true });
    } catch {
      setError('退出失败，会话仍然有效，请重试。');
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-sm text-center">
        <ShieldX size={30} className="mx-auto text-muted-foreground" />
        <h1 className="mt-5 text-xl font-semibold">无控制台访问权限</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">当前成员没有管理控制台角色。</p>
        <Button type="button" className="mt-6" onClick={signOut}>
          <LogOut aria-hidden />
          Sign out
        </Button>
        {error ? (
          <Alert variant="error" className="mt-4 text-left">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </main>
  );
}
