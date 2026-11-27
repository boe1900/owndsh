/**
 * [INPUT]: 依赖当前 enterprise-admin 会话注销动作、TanStack 登录导航、ConfirmDialog 与 coss UI Button。
 * [OUTPUT]: 提供无控制台角色的明确拒绝页和带二次确认的可验证登出入口。
 * [POS]: routes 的固定角色拒绝边界，不把 employee 误导为网络或登录故障。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LogOut, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { logoutCurrentSession } from '@/auth/session';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/403')({
  component: ForbiddenPage
});

function ForbiddenPage() {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string>();

  const signOut = async () => {
    setLoggingOut(true);
    setError(undefined);
    try {
      await logoutCurrentSession();
      await navigate({ to: '/login', replace: true });
    } catch {
      setLoggingOut(false);
      setError('退出失败，会话仍然有效，请重试。');
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-sm text-center">
        <ShieldX size={30} className="mx-auto text-muted-foreground" />
        <h1 className="mt-5 text-xl font-semibold">无控制台访问权限</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">当前成员没有管理控制台角色。</p>
        <Button
          type="button"
          className="mt-6"
          onClick={() => {
            setError(undefined);
            setConfirmOpen(true);
          }}
        >
          <LogOut aria-hidden />
          登出
        </Button>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          cancelAutoFocus
          title="确认登出"
          description="登出后将结束当前浏览器会话，需要重新登录。"
          confirmLabel="确认登出"
          pendingLabel="正在登出..."
          confirmVariant="destructive"
          saving={loggingOut}
          error={error}
          onClose={() => {
            if (loggingOut) return;
            setConfirmOpen(false);
            setError(undefined);
          }}
          onConfirm={() => void signOut()}
        />
      ) : null}
    </main>
  );
}
