/**
 * [INPUT]: 依赖上游 SidebarNav、TanStack Outlet/navigation、Lucide 免费图标与 Beautiful UI Harness tab bar 结构。
 * [OUTPUT]: 提供企业控制台的工作区下拉、产品侧栏、可关闭页面 tab、移动抽屉和内容窗口。
 * [POS]: app 的产品外壳；DOM、尺寸和交互直接由 Beautiful UI Harness 3ea4c181 迁移，业务只注入路由数据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Activity, Boxes, FlaskConical, Menu, Puzzle, Settings, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import SidebarNav, {
  type SidebarNavItem,
  type SidebarWorkspaceAction
} from '@/components/primitives/SidebarNav';

export const PRODUCT_NAV_ITEMS = [
  { to: '/', label: '模型', icon: Boxes },
  { to: '/access', label: '访问策略', icon: ShieldCheck },
  { to: '/plugins', label: '插件', icon: Puzzle },
  { to: '/members', label: '成员', icon: Users },
  { to: '/activity', label: '活动记录', icon: Activity },
  { to: '/settings', label: '设置', icon: Settings }
] as const;

type ProductRoute = (typeof PRODUCT_NAV_ITEMS)[number]['to'];

function isProductRoute(pathname: string): pathname is ProductRoute {
  return PRODUCT_NAV_ITEMS.some((item) => item.to === pathname);
}

export function ConsoleShell() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeRoute: ProductRoute = isProductRoute(pathname) ? pathname : '/';
  const [openTabs, setOpenTabs] = useState<ProductRoute[]>([activeRoute]);

  useEffect(() => {
    setOpenTabs((current) => current.includes(activeRoute) ? current : [...current, activeRoute]);
  }, [activeRoute]);

  const go = (to: ProductRoute) => void navigate({ to });
  const closeMobileNav = () => dialogRef.current?.close();
  const navItems: SidebarNavItem[] = PRODUCT_NAV_ITEMS.slice(0, -1).map(({ to, label, icon: Icon }) => ({
    key: to,
    label,
    icon: <Icon size={18} />
  }));
  const workspaceActions: SidebarWorkspaceAction[] = [
    { label: '组织设置', icon: <Settings size={16} />, onClick: () => go('/settings') },
    { label: '邀请成员', icon: <UserPlus size={16} />, onClick: () => go('/members') },
    { label: '组件示例', icon: <FlaskConical size={16} />, onClick: () => void navigate({ to: '/examples' }) }
  ];

  const openNextTab = () => {
    const next = PRODUCT_NAV_ITEMS.find((item) => !openTabs.includes(item.to))?.to ?? '/';
    go(next);
  };

  const closeTab = (to: ProductRoute) => {
    const remaining = openTabs.filter((item) => item !== to);
    const nextTabs: ProductRoute[] = remaining.length > 0 ? remaining : ['/'];
    setOpenTabs(nextTabs);
    if (to === activeRoute) go(nextTabs.at(-1) ?? '/');
  };

  const sidebar = (mobile = false) => (
    <SidebarNav
      activeNav={activeRoute}
      ariaLabel="产品导航"
      collapsible={!mobile}
      fill
      footerIcon={<Settings size={15} />}
      footerLabel="设置"
      historyLabel={null}
      navItems={navItems}
      onFooterClick={() => {
        go('/settings');
        if (mobile) closeMobileNav();
      }}
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
            <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                aria-label="打开导航"
                onClick={() => dialogRef.current?.showModal()}
                className="mr-0.5 flex size-7 shrink-0 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink lg:hidden"
              >
                <Menu size={16} />
              </button>
              {openTabs.map((to) => {
                const item = PRODUCT_NAV_ITEMS.find((candidate) => candidate.to === to)!;
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
            <Outlet />
          </section>
        </div>
      </div>
    </main>
  );
}
