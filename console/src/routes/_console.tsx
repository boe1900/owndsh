/**
 * [INPUT]: 依赖服务端 Cookie 会话、console bootstrap、静态角色路由与产品 ConsoleShell。
 * [OUTPUT]: 为有权页面提供共享产品壳，并把未登录、无控制台角色及无权直达路由收敛到固定入口。
 * [POS]: routes 的产品认证与页面可见性边界；不读取 Server 菜单，也不包裹 examples。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { ConsoleShell } from '@/app/console-shell';
import { isAccountRoute, isProductRoute, productRoutesFor } from '@/app/product-routes';
import { AuthRequiredError, loadConsoleBootstrap } from '@/auth/session';

export const Route = createFileRoute('/_console')({
  beforeLoad: async ({ location }) => {
    let bootstrap;
    try {
      bootstrap = await loadConsoleBootstrap();
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
      }
      throw error;
    }
    const routes = productRoutesFor(bootstrap.roles);
    if (routes.length === 0) throw redirect({ to: '/403', replace: true });
    if (!isAccountRoute(location.pathname)
      && (!isProductRoute(location.pathname) || !routes.some((route) => route.to === location.pathname))) {
      throw redirect({ to: routes[0]!.to, replace: true });
    }
    return { bootstrap };
  },
  pendingComponent: () => (
    <main className="flex min-h-[100dvh] items-center justify-center bg-page text-[13px] text-ink-3">正在载入控制台...</main>
  ),
  errorComponent: () => (
    <main className="flex min-h-[100dvh] items-center justify-center bg-page p-6 text-ink">
      <div className="text-center">
        <h1 className="text-xl font-semibold">暂时无法连接企业服务</h1>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-canvas">重试</button>
      </div>
    </main>
  ),
  component: ConsoleShell
});
