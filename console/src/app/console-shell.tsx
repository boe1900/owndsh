/**
 * [INPUT]: 依赖 coss UI Sidebar(Header/Content/Footer/Trigger/Rail)/Avatar/Badge/Menu/Button/Alert 原生组件、AccountDialog、WorkspaceDevicesMenuGroup/useWorkspaceDevicesQuery、ConsoleTabBar、OwnDsh 鲸鱼品牌资源、静态控制台路由与 TanStack navigation。
 * [OUTPUT]: 提供左上纯展示品牌与收缩按钮、按模型/扩展/团队/个人四组组织的角色过滤产品侧栏、停靠在左下角的单入口个人头像菜单（在线设备指示与计数、身份抬头、远程连接分组、邀请成员、弹窗用户中心、Sign out）、与 ConsoleTabBar 协同的多标签状态、移动抽屉和内容窗口。
 * [POS]: app 的产品外壳；使用 coss UI 原生 Sidebar inset 布局承接原型布局与原生 coss 组件规范。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Outlet, useNavigate, useRouteContext, useRouterState } from '@tanstack/react-router';
import { ChevronsUpDown, CircleUserRound, LogOut, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logoutCurrentSession } from '@/auth/session';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger
} from '@/components/ui/menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar';
import { AccountDialog } from '@/features/account-page';
import {
  WorkspaceDevicesMenuGroup,
  useWorkspaceDevicesQuery
} from '@/features/workspace/workspace-devices-section';
import { cn } from '@/lib/utils';
import { ConsoleTabBar } from './console-tabs';
import { isAccountRoute, isProductRoute, productRoutesFor, type ProductRoute } from './product-routes';

type SidebarMember = {
  id: string;
  displayName: string;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
};

function ConsoleSidebar({
  activeRoute,
  availableRoutes,
  member,
  onNavigate,
  onSignOut
}: {
  activeRoute: ProductRoute;
  availableRoutes: ReadonlyArray<(typeof import('./product-routes').CONSOLE_ROUTES)[number]>;
  member: SidebarMember;
  onNavigate: (to: ProductRoute) => void;
  onSignOut: () => void;
}) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = state === 'collapsed';
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const workspaceDevices = useWorkspaceDevicesQuery(member.id);
  const { onlineCount, totalCount, hasFatalError } = workspaceDevices;

  const navigateAndClose = (to: ProductRoute) => {
    setMenuOpen(false);
    onNavigate(to);
    if (isMobile) setOpenMobile(false);
  };

  const openAccountDialog = () => {
    setMenuOpen(false);
    if (isMobile) setOpenMobile(false);
    setAccountOpen(true);
  };

  const navItemFor = (to: ProductRoute) => availableRoutes.find((item) => item.to === to);
  const navGroups = [
    { label: '模型', items: (['/', '/access'] as const).flatMap((to) => navItemFor(to) ?? []) },
    { label: '扩展', items: (['/plugins', '/skills', '/mcp'] as const).flatMap((to) => navItemFor(to) ?? []) },
    { label: '团队', items: (['/members', '/activity'] as const).flatMap((to) => navItemFor(to) ?? []) },
    { label: '个人', items: (['/usage'] as const).flatMap((to) => navItemFor(to) ?? []) }
  ].filter((group) => group.items.length > 0);
  const initial = member.displayName.trim().charAt(0).toUpperCase() || member.username.trim().charAt(0).toUpperCase() || 'U';
  const memberSubtitle = member.email?.trim() || `@${member.username}`;
  const statusDotClass = onlineCount > 0
    ? 'bg-emerald-500'
    : hasFatalError
      ? 'bg-destructive'
      : totalCount > 0
        ? 'bg-muted-foreground/50'
        : null;

  return (
    <Sidebar collapsible="icon" variant="inset" aria-label="产品导航">
      <SidebarHeader>
        <div className="flex h-9 items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex aspect-square size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-sidebar-border bg-background">
              <img src="/owndsh-whale-mono-m2-animated.png" alt="" className="size-full object-cover" />
            </div>
            <span className="truncate font-semibold text-foreground group-data-[collapsible=icon]:hidden">OwnDsh</span>
          </div>
          <SidebarTrigger
            aria-label="收起侧边栏"
            title="收起侧边栏 (⌘B)"
            className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={activeRoute === item.to}
                      tooltip={item.label}
                      onClick={() => navigateAndClose(item.to)}
                    >
                      <item.icon aria-hidden />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <Menu open={menuOpen} onOpenChange={setMenuOpen}>
              <MenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={onlineCount > 0 ? `${member.displayName} · ${onlineCount} 台远程设备在线` : member.displayName}
                    aria-label={`${member.displayName} 账号菜单`}
                    className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                  />
                }
              >
                <div className="relative shrink-0">
                  <Avatar className="rounded-lg [--avatar-size:--spacing(7)]">
                    {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  {statusDotClass ? (
                    <span
                      aria-hidden
                      className={cn('absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar', statusDotClass)}
                    />
                  ) : null}
                </div>
                <div className="grid min-w-0 flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium text-foreground">{member.displayName}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{member.username}</span>
                </div>
                <div className="ms-auto flex shrink-0 items-center gap-1.5 group-data-[collapsible=icon]:hidden">
                  {onlineCount > 0 ? (
                    <Badge variant="outline" size="sm" className="font-mono tabular-nums">
                      {onlineCount} 在线
                    </Badge>
                  ) : null}
                  <ChevronsUpDown className="size-4 text-muted-foreground" />
                </div>
              </MenuTrigger>
              {menuOpen ? (
                <MenuPopup
                  align="start"
                  side={collapsed ? 'right' : 'top'}
                  sideOffset={8}
                  className="w-64"
                  data-workspace-menu=""
                >
                  <div className="px-2.5 py-2">
                    <p className="truncate text-sm font-semibold text-foreground">{member.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{memberSubtitle}</p>
                  </div>
                  <MenuSeparator />
                  <WorkspaceDevicesMenuGroup
                    state={workspaceDevices}
                    onOpen={() => {
                      setMenuOpen(false);
                      if (isMobile) setOpenMobile(false);
                    }}
                  />
                  <MenuSeparator />
                  {availableRoutes.some((route) => route.to === '/members') ? (
                    <MenuItem
                      nativeButton
                      render={<button type="button" className="w-full" />}
                      onClick={() => navigateAndClose('/members')}
                    >
                      <UserPlus aria-hidden />
                      <span>邀请成员</span>
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    nativeButton
                    render={<button type="button" className="w-full" />}
                    onClick={openAccountDialog}
                  >
                    <CircleUserRound aria-hidden />
                    <span>用户中心</span>
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    nativeButton
                    variant="destructive"
                    render={<button type="button" className="w-full" />}
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                  >
                    <LogOut aria-hidden />
                    <span>Sign out</span>
                  </MenuItem>
                </MenuPopup>
              ) : null}
            </Menu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
    </Sidebar>
  );
}

export function ConsoleShell() {
  const navigate = useNavigate();
  const { bootstrap } = useRouteContext({ from: '/_console' });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeRoute: ProductRoute = isAccountRoute(pathname) ? '/account' : isProductRoute(pathname) ? pathname : '/';
  const [openTabs, setOpenTabs] = useState<ProductRoute[]>([activeRoute]);
  const [pinnedTabs, setPinnedTabs] = useState<ProductRoute[]>([]);
  const [logoutError, setLogoutError] = useState<string>();
  const availableRoutes = productRoutesFor(bootstrap.roles);

  useEffect(() => {
    setOpenTabs((current) => current.includes(activeRoute) ? current : [...current, activeRoute]);
  }, [activeRoute]);

  const go = (to: ProductRoute) => void navigate({ to });

  const closeTab = (to: ProductRoute) => {
    if (pinnedTabs.includes(to)) return;
    const remaining = openTabs.filter((item) => item !== to);
    const nextTabs: ProductRoute[] = remaining.length > 0 ? remaining : [availableRoutes[0]?.to ?? '/account'];
    setOpenTabs(nextTabs);
    if (to === activeRoute) go(nextTabs.at(-1) ?? '/');
  };

  const togglePin = (to: ProductRoute) => {
    setPinnedTabs((current) => current.includes(to)
      ? current.filter((item) => item !== to)
      : [...current, to]);
  };

  const closeOthers = (keep: ProductRoute) => {
    const pinnedSet = new Set(pinnedTabs);
    const nextTabs = openTabs.filter((item) => item === keep || pinnedSet.has(item));
    setOpenTabs(nextTabs);
    if (!nextTabs.includes(activeRoute)) go(keep);
  };

  const closeRight = (target: ProductRoute) => {
    const pinnedSet = new Set(pinnedTabs);
    const ordered = [
      ...openTabs.filter((item) => pinnedSet.has(item)),
      ...openTabs.filter((item) => !pinnedSet.has(item))
    ];
    const index = ordered.indexOf(target);
    if (index === -1) return;
    const nextTabs = ordered.filter((item, itemIndex) => itemIndex <= index || pinnedSet.has(item));
    setOpenTabs(nextTabs);
    if (!nextTabs.includes(activeRoute)) go(target);
  };

  const signOut = () => {
    void logoutCurrentSession()
      .then(() => navigate({ to: '/login', replace: true }))
      .catch(() => setLogoutError('退出失败，会话仍然有效，请重试。'));
  };

  return (
    <SidebarProvider className="h-[100dvh] overflow-hidden">
      <ConsoleSidebar
        activeRoute={activeRoute}
        availableRoutes={availableRoutes}
        member={bootstrap.member}
        onNavigate={go}
        onSignOut={signOut}
      />

      <SidebarInset className="min-h-0 min-w-0 overflow-hidden md:peer-data-[variant=inset]:h-[calc(100dvh-1rem)] md:peer-data-[variant=inset]:border">
        <ConsoleTabBar
          activeRoute={activeRoute}
          availableRoutes={availableRoutes}
          openTabs={openTabs}
          pinnedTabs={pinnedTabs}
          onCloseOthers={closeOthers}
          onCloseRight={closeRight}
          onCloseTab={closeTab}
          onSelectRoute={go}
          onTogglePin={togglePin}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>

      {logoutError ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-[min(380px,calc(100vw-32px))]">
          <Alert variant="error" className="bg-popover shadow-lg">
            <AlertDescription>{logoutError}</AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="关闭退出错误"
                onClick={() => setLogoutError(undefined)}
              >
                <X aria-hidden className="size-3.5" />
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}
    </SidebarProvider>
  );
}
