/**
 * [INPUT]: 依赖上游 SidebarNav/ThemeToggle、静态控制台路由、TanStack navigation 与 Beautiful UI Harness tab bar 结构。
 * [OUTPUT]: 提供角色过滤产品侧栏、工作区用户中心导航/Sign out、深浅主题、可关闭页面 tab、移动抽屉和内容窗口。
 * [POS]: app 的产品外壳；DOM、尺寸和交互直接由 Beautiful UI Harness 3ea4c181 迁移，业务只注入路由数据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Outlet, useNavigate, useRouteContext, useRouterState } from '@tanstack/react-router';
import { CircleUserRound, FlaskConical, LogOut, Menu, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { logoutCurrentSession } from '@/auth/session';
import SidebarNav, {
  type SidebarNavItem,
  type SidebarWorkspaceAction
} from '@/components/primitives/SidebarNav';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { CONSOLE_ROUTES, isAccountRoute, isProductRoute, productRoutesFor, type ProductRoute } from './product-routes';

export function ConsoleShell() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeRoute: ProductRoute = isAccountRoute(pathname) ? '/account' : isProductRoute(pathname) ? pathname : '/';
  const [openTabs, setOpenTabs] = useState<ProductRoute[]>([activeRoute]);
  const [logoutError, setLogoutError] = useState<string>();
  const availableRoutes = productRoutesFor(bootstrap.roles);

  useEffect(() => {
    setOpenTabs((current) => current.includes(activeRoute) ? current : [...current, activeRoute]);
  }, [activeRoute]);

  const go = (to: ProductRoute) => void navigate({ to });
  const closeMobileNav = () => dialogRef.current?.close();
  const navItems: SidebarNavItem[] = availableRoutes.map(({ to, label, icon: Icon }) => ({
    key: to,
    label,
    icon: <Icon size={18} />
  }));
  const workspaceActions: SidebarWorkspaceAction[] = [];
  if (availableRoutes.some((route) => route.to === '/members')) {
    workspaceActions.push({ label: '邀请成员', icon: <UserPlus size={16} />, onClick: () => go('/members') });
  }
  workspaceActions.push(
    { label: '组件示例', icon: <FlaskConical size={16} />, onClick: () => void navigate({ to: '/examples' }) },
    { label: '用户中心', icon: <CircleUserRound size={16} />, onClick: () => go('/account') },
    {
      label: 'Sign out',
      icon: <LogOut size={16} />,
      separated: true,
      onClick: () => void logoutCurrentSession()
        .then(() => navigate({ to: '/login', replace: true }))
        .catch(() => setLogoutError('退出失败，会话仍然有效，请重试。'))
    }
  );

  const openNextTab = () => {
    const next = availableRoutes.find((item) => !openTabs.includes(item.to))?.to ?? availableRoutes[0]!.to;
    go(next);
  };

  const closeTab = (to: ProductRoute) => {
    const remaining = openTabs.filter((item) => item !== to);
    const nextTabs: ProductRoute[] = remaining.length > 0 ? remaining : [availableRoutes[0]!.to];
    setOpenTabs(nextTabs);
    if (to === activeRoute) go(nextTabs.at(-1) ?? '/');
  };

  const sidebar = (mobile = false) => (
    <SidebarNav
      activeNav={activeRoute}
      ariaLabel="产品导航"
      collapsible={!mobile}
      fill
      footerLabel={null}
      historyLabel={null}
      navItems={navItems}
      onNavigate={(key) => {
        if (isProductRoute(key)) go(key);
        if (mobile) closeMobileNav();
      }}
      primaryAction={null}
      workspace={{ key: 'enterprise', name: 'Agent Platform', monogram: 'A' }}
      workspaceActions={workspaceActions}
    />
  );

  return (
    <main className="flex h-[100dvh] gap-0 bg-canvas p-2.5 text-ink lg:pl-0">
      <div className="hidden lg:flex">{sidebar()}</div>

      <dialog
        ref={dialogRef}
        aria-label="移动产品导航"
        className="m-0 h-[100dvh] max-h-none w-[244px] max-w-none bg-canvas p-2.5 text-ink backdrop:bg-black/50 lg:hidden"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMobileNav();
        }}
      >
        <button
          type="button"
          aria-label="关闭导航"
          onClick={closeMobileNav}
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors duration-150 hover:bg-hover-2 hover:text-ink"
        >
          <X size={18} />
        </button>
        {sidebar(true)}
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-h-0 flex-1 gap-2.5">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-page">
            <div className="flex h-11 shrink-0 items-center border-b border-line">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  aria-label="打开导航"
                  onClick={() => dialogRef.current?.showModal()}
                  className="mr-0.5 flex size-7 shrink-0 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink lg:hidden"
                >
                  <Menu size={16} />
                </button>
                {openTabs.map((to) => {
                  const item = CONSOLE_ROUTES.find((candidate) => candidate.to === to)!;
                  return (
                    <div
                      key={to}
                      className={`group/tab flex h-7 w-36 shrink-0 items-center gap-0.5 rounded-[7px] pl-2.5 pr-0.5 text-[12.5px] font-medium transition-colors duration-100 ${
                        to === activeRoute ? 'bg-hover-2 text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'
                      }`}
                    >
                      <button type="button" aria-pressed={to === activeRoute} onClick={() => go(to)} title={item.label} className="min-w-0 flex-1 text-left">
                        <span className="block truncate">{item.label}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`关闭${item.label}`}
                        onClick={() => closeTab(to)}
                        className="-my-1 flex size-6 shrink-0 items-center justify-center rounded-[5px] text-ink-3 transition-[background-color,color] duration-100 hover:bg-hover-2 hover:text-ink"
                      >
                        <X size={11} strokeWidth={2.4} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  aria-label="打开新页面"
                  onClick={openNextTab}
                  className="ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
                >
                  <span className="text-[20px] leading-none">+</span>
                </button>
              </div>
              <div className="shrink-0 bg-page pr-2">
                <ThemeToggle />
              </div>
            </div>
            <Outlet />
          </section>
        </div>
      </div>
      {logoutError && (
        <div role="alert" className="fixed bottom-4 right-4 z-50 flex max-w-[min(360px,calc(100vw-32px))] items-center gap-3 rounded-[8px] bg-surface px-3 py-2.5 text-[13px] text-ink shadow-overlay">
          <span className="min-w-0 flex-1">{logoutError}</span>
          <button type="button" aria-label="关闭退出错误" onClick={() => setLogoutError(undefined)} className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-ink-3 hover:bg-hover-2 hover:text-ink">
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  );
}
