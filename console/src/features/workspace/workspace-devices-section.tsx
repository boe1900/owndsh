/**
 * [INPUT]: 依赖本人设备 Cookie API、既有 Query 缓存、统一设备可用性与 coss UI MenuGroup/MenuGroupLabel/MenuItem/MenuLinkItem/Alert/Button/Spinner 原生组件。
 * [OUTPUT]: 提供 `useWorkspaceDevicesQuery` 设备状态查询 Hook 与嵌入左下角头像菜单内的 `WorkspaceDevicesMenuGroup`（远程连接分组标题 + 刷新、在线设备 `MenuLinkItem` 新标签直连与状态绿点、不可用设备原因、无设备提示及失败重试）。
 * [POS]: workspace 的 Console 入口；嵌入侧栏底座账号菜单，目录状态留在业务模块，不进入产品路由或页面 tabs。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ExternalLink, Monitor, RefreshCw } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MenuGroup, MenuGroupLabel, MenuItem, MenuLinkItem } from '@/components/ui/menu';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { deviceAvailability, listWorkspaceDevices, workspaceUrl } from './workspace-api';

export function useWorkspaceDevicesQuery(memberId: string) {
  const query = useQuery({
    queryKey: ['workspace-devices', memberId],
    queryFn: ({ signal }) => listWorkspaceDevices(signal),
    staleTime: 15_000,
    retry: false
  });

  const rawDevices = query.data ?? [];
  const sortedDevices = useMemo(() => {
    const online = rawDevices.filter((device) => deviceAvailability(device) === '在线');
    const unavailable = rawDevices.filter((device) => deviceAvailability(device) !== '在线');
    return [...online, ...unavailable];
  }, [rawDevices]);

  const totalCount = rawDevices.length;
  const onlineCount = sortedDevices.filter((device) => deviceAvailability(device) === '在线').length;
  const hasFatalError = query.isError && !query.data;

  return {
    query,
    sortedDevices,
    totalCount,
    onlineCount,
    hasFatalError
  };
}

export type WorkspaceDevicesState = ReturnType<typeof useWorkspaceDevicesQuery>;

const MAX_COMPACT_ROWS = 3;

export function WorkspaceDevicesMenuGroup({ state, onOpen }: {
  state: WorkspaceDevicesState;
  onOpen?: () => void;
}) {
  const sectionId = useId();
  const [expanded, setExpanded] = useState(false);
  const { query, sortedDevices, totalCount, hasFatalError } = state;
  // 最多仅占 3 行：<=3 台全量直出；>3 台前 2 台留给高频可用设备，第 3 行固定让位给“查看更多”
  const hasOverflow = totalCount > MAX_COMPACT_ROWS;
  const visibleDevices = !expanded && hasOverflow
    ? sortedDevices.slice(0, MAX_COMPACT_ROWS - 1)
    : sortedDevices;
  const hiddenCount = totalCount - visibleDevices.length;

  return (
    <MenuGroup aria-label="远程连接">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <MenuGroupLabel className="p-0">远程连接</MenuGroupLabel>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="刷新远程设备"
          title="刷新远程设备"
          disabled={query.isFetching}
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            void query.refetch();
          }}
        >
          <RefreshCw aria-hidden className={cn('size-3', query.isFetching && 'animate-spin')} />
        </Button>
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>正在读取设备…</span>
        </div>
      ) : hasFatalError ? (
        <div className="grid gap-2 px-2 py-1.5">
          <Alert variant="error" className="px-2.5 py-2 text-xs">
            <AlertDescription>设备列表读取失败，请刷新重试</AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              void query.refetch();
            }}
          >
            重新读取
          </Button>
        </div>
      ) : totalCount === 0 ? (
        <div className="space-y-0.5 px-2.5 py-1.5 text-xs">
          <p className="font-medium text-foreground">暂无远程设备</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            在桌面客户端登录并开启远控后，设备会出现在这里。
          </p>
        </div>
      ) : (
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {query.isError ? (
            <p role="status" className="m-0 px-2.5 py-1 text-[11px] text-muted-foreground">
              刷新失败，显示上次设备状态
            </p>
          ) : null}

          {visibleDevices.map((device) => {
            const availability = deviceAvailability(device);
            const isOnline = availability === '在线';
            const label = `${device.name} · ${availability}`;
            const reasonId = `${sectionId}-${device.deviceId}`;

            return isOnline ? (
              <MenuLinkItem
                key={device.deviceId}
                href={workspaceUrl(device.deviceId)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${label}，在新标签页打开`}
                onClick={() => onOpen?.()}
                className="justify-between gap-2 py-1.5"
              >
                <Monitor aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{device.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
                  <ExternalLink aria-hidden className="size-3 text-muted-foreground" />
                </span>
              </MenuLinkItem>
            ) : (
              <MenuItem
                key={device.deviceId}
                disabled
                aria-label={label}
                aria-describedby={reasonId}
                className="justify-between gap-2 py-1.5"
              >
                <Monitor aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{device.name}</span>
                <span id={reasonId} className="shrink-0 text-[11px] text-muted-foreground">
                  {availability}
                </span>
              </MenuItem>
            );
          })}

          {hasOverflow ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((current) => !current);
              }}
              className="flex min-h-8 w-full cursor-pointer select-none items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-base text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground sm:min-h-7 sm:text-sm"
            >
              <span className="flex items-center gap-2">
                {expanded ? (
                  <ChevronUp aria-hidden className="size-3.5 shrink-0" />
                ) : (
                  <ChevronDown aria-hidden className="size-3.5 shrink-0" />
                )}
                <span>{expanded ? '收起' : '查看更多'}</span>
              </span>
              {!expanded ? (
                <span className="shrink-0 font-mono text-[11px] tabular-nums">+{hiddenCount}</span>
              ) : null}
            </button>
          ) : null}
        </div>
      )}
    </MenuGroup>
  );
}
