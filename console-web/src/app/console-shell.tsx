/**
 * [INPUT]: 直接裁剪自 Beautiful UI 3ea4c18 IceCreamHarness shell，依赖产品 Sidebar、ThemeToggle 与 TanStack Outlet。
 * [OUTPUT]: 提供与参考站相同的全视口 canvas、圆角内容窗口、紧凑顶部区和移动导航抽屉。
 * [POS]: app 的已登录产品外壳；删除聊天 tabs/prompt/pane 后承载全部静态业务路由。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Outlet, useRouterState } from '@tanstack/react-router';
import { Menu, X } from 'lucide-react';
import { useRef } from 'react';
import SidebarNav, { PRODUCT_NAV_ITEMS } from '../ui/beautiful/sidebar-nav';
import { ThemeToggle } from '../ui/beautiful/theme-toggle';

export function ConsoleShell() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pageTitle = PRODUCT_NAV_ITEMS.find((item) => item.to === pathname)?.label ?? 'Agent Platform';
  const closeMobileNav = () => dialogRef.current?.close();

  return (
    <main className="flex h-[100dvh] gap-0 bg-canvas p-2.5 text-ink lg:pl-0">
      <SidebarNav fill className="hidden lg:flex" />

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
          title="关闭导航"
        >
          <X size={18} strokeWidth={1.8} />
        </button>
        <SidebarNav fill collapsible={false} onNavigate={closeMobileNav} />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-h-0 flex-1 gap-2.5">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-page">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-3">
              <button
                type="button"
                aria-label="打开导航"
                aria-haspopup="dialog"
                onClick={() => dialogRef.current?.showModal()}
                className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink lg:hidden"
                title="打开导航"
              >
                <Menu size={17} strokeWidth={1.8} />
              </button>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{pageTitle}</span>
              <ThemeToggle />
            </div>
            <Outlet />
          </section>
        </div>
      </div>
    </main>
  );
}
