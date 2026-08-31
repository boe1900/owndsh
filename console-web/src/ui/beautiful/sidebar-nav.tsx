/**
 * [INPUT]: 直接裁剪自 Beautiful UI 3ea4c18 SidebarNav，依赖 TanStack Link、GlideMenu 与 Lucide 免费图标。
 * [OUTPUT]: 提供与 Harness 参考站相同 224px/52px 比例、滑动高亮和折叠动效的产品导航。
 * [POS]: ui/beautiful 的产品侧栏；只替换原聊天导航数据，不改变参考组件的布局与交互参数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Link } from '@tanstack/react-router';
import {
  Activity,
  Boxes,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon
} from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import GlideMenu from './glide-menu';

export const PRODUCT_NAV_ITEMS = [
  { to: '/', label: '模型', icon: Boxes },
  { to: '/access', label: '访问策略', icon: ShieldCheck },
  { to: '/plugins', label: '插件', icon: Puzzle },
  { to: '/members', label: '成员', icon: Users },
  { to: '/activity', label: '活动记录', icon: Activity },
  { to: '/settings', label: '设置', icon: Settings }
] as const;

type ProductRoute = (typeof PRODUCT_NAV_ITEMS)[number]['to'];

type SidebarNavProps = {
  className?: string;
  collapsible?: boolean;
  fill?: boolean;
  onNavigate?: () => void;
};

const SIDEBAR_MOTION = {
  expandedWidth: 224,
  collapsedWidth: 52,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
};

function GlideGroup({ children }: { children: ReactNode }) {
  return (
    <GlideMenu
      rowSelector="[data-row]"
      highlightClassName="sidebar-glide-highlight rounded-[7px] bg-hover-2"
      className="group/glide flex flex-col gap-px"
    >
      {children}
    </GlideMenu>
  );
}

function RailLink({ icon: Icon, label, onNavigate, to }: {
  icon: LucideIcon;
  label: string;
  onNavigate?: () => void;
  to: ProductRoute;
}) {
  return (
    <Link
      data-row
      to={to}
      title={label}
      activeOptions={{ exact: true }}
      activeProps={{ className: 'bg-hover-2 text-ink group-hover/glide:bg-transparent' }}
      inactiveProps={{ className: 'text-ink-2' }}
      onClick={onNavigate}
      className="sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]"
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium">
        {label}
      </span>
    </Link>
  );
}

export default function SidebarNav({
  className = '',
  collapsible = true,
  fill = false,
  onNavigate
}: SidebarNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = collapsible && collapsed;

  return (
    <aside
      data-sidebar-collapsed={isCollapsed}
      aria-label="产品导航"
      className={`relative flex shrink-0 overflow-hidden transition-[width] ${fill ? 'h-full' : 'h-[600px]'} ${className}`}
      style={{
        width: isCollapsed ? SIDEBAR_MOTION.collapsedWidth : SIDEBAR_MOTION.expandedWidth,
        transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
        transitionTimingFunction: SIDEBAR_MOTION.easing,
        '--sidebar-copy-duration': `${SIDEBAR_MOTION.copyDuration}ms`,
        '--sidebar-copy-offset': `${SIDEBAR_MOTION.copyOffset}px`,
        '--sidebar-easing': SIDEBAR_MOTION.easing
      } as CSSProperties}
    >
      <div className="flex min-h-0 w-[224px] shrink-0 flex-col">
        <div className="relative mb-2.5 h-10 shrink-0">
          <Link
            to="/"
            aria-hidden={isCollapsed}
            tabIndex={isCollapsed ? -1 : 0}
            className="sidebar-workspace-control absolute left-2 top-1 flex h-8 w-[164px] items-center rounded-[8px] px-2 text-left transition-[background-color,transform] duration-100 hover:bg-hover-2 active:scale-[0.99]"
          >
            <span className="sidebar-logo flex size-5 shrink-0 items-center justify-center text-ink">
              <Sparkles size={18} strokeWidth={1.8} />
            </span>
            <span className="sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium text-ink-2">
              Agent Platform
            </span>
          </Link>

          {collapsible && (
            <>
              <button
                type="button"
                aria-label="收起侧栏"
                aria-hidden={isCollapsed}
                tabIndex={isCollapsed ? -1 : 0}
                onClick={() => setCollapsed(true)}
                className="sidebar-collapse-control absolute right-2 top-1 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
                title="收起侧栏"
              >
                <PanelLeftClose size={18} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                aria-label="展开侧栏"
                aria-hidden={!isCollapsed}
                tabIndex={isCollapsed ? 0 : -1}
                onClick={() => setCollapsed(false)}
                className="sidebar-expand-control absolute left-2 top-0.5 flex size-9 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
                title="展开侧栏"
              >
                <PanelLeftOpen size={18} strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>

        <GlideGroup>
          {PRODUCT_NAV_ITEMS.slice(0, -1).map((item) => (
            <RailLink key={item.to} {...item} onNavigate={onNavigate} />
          ))}
        </GlideGroup>

        <div className="min-h-0 flex-1" />

        <div className="border-t border-line pt-3">
          <GlideGroup>
            <RailLink {...PRODUCT_NAV_ITEMS[5]} onNavigate={onNavigate} />
          </GlideGroup>
        </div>
      </div>
    </aside>
  );
}
