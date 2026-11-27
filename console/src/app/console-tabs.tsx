/**
 * [INPUT]: 依赖 coss UI SidebarTrigger/Menu/Popover/Dialog/Button/InputGroup/Separator 与 ThemeToggle、product-routes 元数据。
 * [OUTPUT]: 提供白底极简底线风格的顶部控制台标签栏 ConsoleTabBar：支持固定标签置前、悬停显现关闭、右键菜单（固定/关闭其他/关闭右侧）、+ 模块菜单、已打开标签总览、⌘K 快速跳转与主题切换。
 * [POS]: app 的顶栏标签工作台呈现层，由 ConsoleShell 注入路由与标签状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { ChevronDown, Pin, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger
} from '@/components/ui/menu';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { CONSOLE_ROUTES, type ProductRoute } from './product-routes';

type ContextMenuState = {
  to: ProductRoute;
  anchor: { getBoundingClientRect: () => DOMRect };
};

function pointAnchor(clientX: number, clientY: number) {
  return {
    getBoundingClientRect: () => ({
      x: clientX,
      y: clientY,
      left: clientX,
      top: clientY,
      right: clientX,
      bottom: clientY,
      width: 0,
      height: 0,
      toJSON: () => ({})
    }) as DOMRect
  };
}

function routeMeta(to: ProductRoute) {
  return CONSOLE_ROUTES.find((candidate) => candidate.to === to);
}

export function ConsoleTabBar({
  activeRoute,
  availableRoutes,
  openTabs,
  pinnedTabs,
  onCloseOthers,
  onCloseRight,
  onCloseTab,
  onSelectRoute,
  onTogglePin
}: {
  activeRoute: ProductRoute;
  availableRoutes: ReadonlyArray<(typeof CONSOLE_ROUTES)[number]>;
  openTabs: ReadonlyArray<ProductRoute>;
  pinnedTabs: ReadonlyArray<ProductRoute>;
  onSelectRoute: (to: ProductRoute) => void;
  onCloseTab: (to: ProductRoute) => void;
  onTogglePin: (to: ProductRoute) => void;
  onCloseOthers: (keep: ProductRoute) => void;
  onCloseRight: (target: ProductRoute) => void;
}) {
  const { isMobile, open: sidebarOpen } = useSidebar();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const showExpandTrigger = isMobile || !sidebarOpen;

  const pinnedSet = useMemo(() => new Set(pinnedTabs), [pinnedTabs]);
  const orderedTabs = useMemo(
    () => [
      ...openTabs.filter((to) => pinnedSet.has(to)),
      ...openTabs.filter((to) => !pinnedSet.has(to))
    ],
    [openTabs, pinnedSet]
  );

  const quickRoutes = availableRoutes.length > 0
    ? availableRoutes
    : CONSOLE_ROUTES.filter((route) => route.to === '/account');

  const filteredRoutes = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return quickRoutes;
    return quickRoutes.filter((route) => route.label.toLowerCase().includes(q) || route.to.toLowerCase().includes(q));
  }, [commandQuery, quickRoutes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandQuery('');
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const contextRoute = contextMenu ? routeMeta(contextMenu.to) : undefined;
  const contextPinned = contextMenu ? pinnedSet.has(contextMenu.to) : false;

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between gap-2 bg-background px-3">
      <Separator className="pointer-events-none absolute inset-x-0 bottom-0 z-0" />

      <div className="relative z-10 flex h-full min-w-0 flex-1 items-center gap-2">
        {showExpandTrigger ? (
          <>
            <SidebarTrigger aria-label="切换导航" title="展开侧边栏 (⌘B)" className="shrink-0" />
            <Separator orientation="vertical" className="h-4 shrink-0" />
          </>
        ) : null}

        <div
          className="flex h-full min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="navigation"
          aria-label="已打开工作区标签页"
        >
          {orderedTabs.map((to) => {
            const item = routeMeta(to);
            if (!item) return null;
            const active = to === activeRoute;
            const pinned = pinnedSet.has(to);
            const Icon = item.icon;
            return (
              <div
                key={to}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({
                    to,
                    anchor: pointAnchor(event.clientX, event.clientY)
                  });
                }}
                className={cn(
                  'group relative flex h-full shrink-0 items-center gap-1.5 px-2.5 select-none transition-colors',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    'size-3.5 shrink-0 transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectRoute(to)}
                  title={item.label}
                  className="min-w-0 max-w-[120px] truncate text-left text-[13px] outline-none sm:text-xs"
                >
                  {item.label}
                </button>
                {pinned ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`取消固定${item.label}`}
                    title="取消固定"
                    onClick={() => onTogglePin(to)}
                    className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Pin aria-hidden className="size-3" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`关闭${item.label}`}
                    title="关闭标签页"
                    onClick={() => onCloseTab(to)}
                    className={cn(
                      'size-5 shrink-0 text-muted-foreground transition-opacity hover:text-foreground',
                      active
                        ? 'opacity-75 hover:opacity-100'
                        : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100'
                    )}
                  >
                    <X aria-hidden className="size-3" />
                  </Button>
                )}
                {active ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 rounded-t-full bg-primary"
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <Menu>
          <MenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="打开新页面"
                title="打开标签页"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              />
            }
          >
            <Plus aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuPopup align="start" sideOffset={6} className="w-56">
            <MenuGroup>
              <MenuGroupLabel>打开功能模块</MenuGroupLabel>
              {quickRoutes.map((route) => {
                const Icon = route.icon;
                const isOpen = openTabs.includes(route.to);
                return (
                  <MenuItem
                    key={route.to}
                    nativeButton
                    render={<button type="button" className="w-full" />}
                    onClick={() => onSelectRoute(route.to)}
                  >
                    <Icon aria-hidden />
                    <span className="truncate">{route.label}</span>
                    {isOpen ? <span className="ms-auto text-xs text-muted-foreground">已打开</span> : null}
                  </MenuItem>
                );
              })}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setCommandQuery('');
            setCommandOpen(true);
          }}
          className="hidden gap-2 text-muted-foreground sm:inline-flex"
        >
          <Search aria-hidden className="size-3.5" />
          <span>快速跳转</span>
          <kbd className="rounded border bg-background px-1 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </Button>

        <Popover open={overviewOpen} onOpenChange={setOverviewOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="已打开标签页列表"
                title="已打开标签页列表"
                className="text-muted-foreground hover:text-foreground"
              />
            }
          >
            <ChevronDown aria-hidden className="size-3.5" />
          </PopoverTrigger>
          <PopoverPopup align="end" sideOffset={6} className="w-60 p-1.5">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground">已打开标签页</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  onCloseOthers(activeRoute);
                  setOverviewOpen(false);
                }}
              >
                仅保留当前
              </Button>
            </div>
            <div className="mt-1 max-h-64 space-y-0.5 overflow-y-auto">
              {orderedTabs.map((to) => {
                const item = routeMeta(to);
                if (!item) return null;
                const active = to === activeRoute;
                const pinned = pinnedSet.has(to);
                const Icon = item.icon;
                return (
                  <div
                    key={to}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-1 py-0.5',
                      active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectRoute(to);
                        setOverviewOpen(false);
                      }}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left text-xs outline-none',
                        active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                    {pinned ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`取消固定${item.label}`}
                        onClick={() => onTogglePin(to)}
                        className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <Pin aria-hidden className="size-3" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`关闭${item.label}`}
                        onClick={() => onCloseTab(to)}
                        className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X aria-hidden className="size-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </PopoverPopup>
        </Popover>

        <ThemeToggle />
      </div>

      <Menu
        open={contextMenu !== null}
        onOpenChange={(open) => {
          if (!open) setContextMenu(null);
        }}
      >
        <MenuPopup
          anchor={contextMenu?.anchor}
          align="start"
          side="bottom"
          sideOffset={4}
          className="w-44"
        >
          {contextMenu && contextRoute ? (
            <>
              <MenuItem
                nativeButton
                render={<button type="button" className="w-full" />}
                onClick={() => {
                  onTogglePin(contextMenu.to);
                  setContextMenu(null);
                }}
              >
                <Pin aria-hidden />
                <span>{contextPinned ? '取消固定标签页' : '固定标签页'}</span>
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                nativeButton
                render={<button type="button" className="w-full" />}
                disabled={contextPinned}
                onClick={() => {
                  onCloseTab(contextMenu.to);
                  setContextMenu(null);
                }}
              >
                <span>关闭标签页</span>
              </MenuItem>
              <MenuItem
                nativeButton
                render={<button type="button" className="w-full" />}
                onClick={() => {
                  onCloseOthers(contextMenu.to);
                  setContextMenu(null);
                }}
              >
                <span>关闭其他标签页</span>
              </MenuItem>
              <MenuItem
                nativeButton
                render={<button type="button" className="w-full" />}
                onClick={() => {
                  onCloseRight(contextMenu.to);
                  setContextMenu(null);
                }}
              >
                <span>关闭右侧标签页</span>
              </MenuItem>
            </>
          ) : null}
        </MenuPopup>
      </Menu>

      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogPopup
          aria-label="快速跳转"
          showCloseButton={false}
          className="max-w-lg overflow-hidden p-0"
        >
          <div className="border-b px-3 py-2">
            <InputGroup className="border-0 bg-transparent shadow-none focus-within:ring-0">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                autoFocus
                placeholder="搜索模块或页面名称..."
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredRoutes[0]) {
                    event.preventDefault();
                    onSelectRoute(filteredRoutes[0].to);
                    setCommandOpen(false);
                  }
                }}
              />
              <InputGroupAddon align="inline-end">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
              </InputGroupAddon>
            </InputGroup>
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto p-2">
            {filteredRoutes.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">无匹配模块</div>
            ) : (
              filteredRoutes.map((route) => {
                const Icon = route.icon;
                const active = route.to === activeRoute;
                return (
                  <Button
                    key={route.to}
                    type="button"
                    variant={active ? 'secondary' : 'ghost'}
                    className="w-full justify-between font-normal"
                    onClick={() => {
                      onSelectRoute(route.to);
                      setCommandOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon aria-hidden className="size-4 text-muted-foreground" />
                      <span>打开「{route.label}」</span>
                    </span>
                    <span className="text-xs text-muted-foreground">模块标签</span>
                  </Button>
                );
              })
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </header>
  );
}
