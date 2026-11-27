/**
 * [INPUT]: 依赖 Testing Library、Vitest、SidebarProvider 与 ConsoleTabBar、PRODUCT_ROUTES 元数据。
 * [OUTPUT]: 验证白底极简底线标签栏的标签切换/固定排序、+ 模块菜单、已打开标签总览、右键上下文菜单与 ⌘K 快速跳转命令面板。
 * [POS]: app 的顶栏标签工作台行为门禁，防止多标签交互与原生 coss UI 菜单/弹窗退化。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ConsoleTabBar } from './console-tabs';
import { PRODUCT_ROUTES, type ProductRoute } from './product-routes';

afterEach(cleanup);

function renderTabBar(
  overrides: Partial<Parameters<typeof ConsoleTabBar>[0]> = {},
  { defaultOpen = true }: { defaultOpen?: boolean } = {}
) {
  const props: Parameters<typeof ConsoleTabBar>[0] = {
    activeRoute: '/',
    availableRoutes: PRODUCT_ROUTES,
    openTabs: ['/access', '/', '/members'],
    pinnedTabs: [],
    onSelectRoute: vi.fn(),
    onCloseTab: vi.fn(),
    onTogglePin: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseRight: vi.fn(),
    ...overrides
  };

  render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <ConsoleTabBar {...props} />
    </SidebarProvider>
  );

  return props;
}

describe('ConsoleTabBar', () => {
  it('orders pinned tabs first and lets users switch or close tabs', () => {
    const props = renderTabBar({
      openTabs: ['/access', '/', '/members'],
      pinnedTabs: ['/members']
    });

    const nav = screen.getByRole('navigation', { name: '已打开工作区标签页' });
    const tabButtons = Array.from(nav.querySelectorAll('button[aria-pressed]')).map((button) => button.textContent);
    expect(tabButtons).toEqual(['成员', '访问策略', '模型']);

    fireEvent.click(screen.getByRole('button', { name: '访问策略' }));
    expect(props.onSelectRoute).toHaveBeenCalledWith('/access');

    fireEvent.click(screen.getByRole('button', { name: '关闭模型' }));
    expect(props.onCloseTab).toHaveBeenCalledWith('/');
  });

  it('opens the coss quick-add module menu from the + trigger', () => {
    const props = renderTabBar();

    fireEvent.click(screen.getByRole('button', { name: '打开新页面' }));
    const pluginsItem = screen.getByRole('menuitem', { name: /插件/ });
    expect(pluginsItem).toBeTruthy();
    fireEvent.click(pluginsItem);
    expect(props.onSelectRoute).toHaveBeenCalledWith('/plugins');
  });

  it('opens the tab overview popover and supports keep-only-current', () => {
    const props = renderTabBar({ activeRoute: '/' });

    fireEvent.click(screen.getByRole('button', { name: '已打开标签页列表' }));
    expect(screen.getByText('已打开标签页')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '仅保留当前' }));
    expect(props.onCloseOthers).toHaveBeenCalledWith('/');
  });

  it('opens the right-click context menu for pin, close others, and close right', () => {
    const props = renderTabBar();

    const accessTab = screen.getByRole('button', { name: '访问策略' }).parentElement!;
    fireEvent.contextMenu(accessTab, { clientX: 120, clientY: 32 });
    fireEvent.click(screen.getByRole('menuitem', { name: '固定标签页' }));
    expect(props.onTogglePin).toHaveBeenCalledWith('/access');

    fireEvent.contextMenu(accessTab, { clientX: 120, clientY: 32 });
    fireEvent.click(screen.getByRole('menuitem', { name: '关闭右侧标签页' }));
    expect(props.onCloseRight).toHaveBeenCalledWith('/access');
  });

  it('opens the quick jump command dialog with Cmd/Ctrl+K and navigates on Enter', () => {
    const props = renderTabBar();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const searchInput = screen.getByPlaceholderText('搜索模块或页面名称...');
    fireEvent.change(searchInput, { target: { value: '活动' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(props.onSelectRoute).toHaveBeenCalledWith('/activity' satisfies ProductRoute);
  });

  it('hides the expand trigger when desktop sidebar is expanded and shows it when collapsed', () => {
    renderTabBar({}, { defaultOpen: true });
    expect(screen.queryByRole('button', { name: '切换导航' })).toBeNull();

    cleanup();
    renderTabBar({}, { defaultOpen: false });
    expect(screen.getByRole('button', { name: '切换导航' })).toBeTruthy();
  });
});
