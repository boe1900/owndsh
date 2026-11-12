/**
 * [INPUT]: 依赖本人设备 Cookie API、既有 Query 缓存、统一设备可用性与侧栏折叠状态。
 * [OUTPUT]: 提供远程连接设备分组，可用设备以原生链接打开独立标签，不可用项保留原因。
 * [POS]: workspace 的 Console 入口；目录状态留在业务模块，不进入产品路由或页面 tabs。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useQuery } from '@tanstack/react-query';
import { Monitor, RefreshCw } from 'lucide-react';
import { useId } from 'react';
import { deviceAvailability, listWorkspaceDevices, workspaceUrl } from './workspace-api';

export function WorkspaceDevicesSection({ memberId, collapsed, onOpen }: {
  memberId: string;
  collapsed: boolean;
  onOpen?: () => void;
}) {
  const sectionId = useId();
  const devices = useQuery({ queryKey: ['workspace-devices', memberId], queryFn: ({ signal }) => listWorkspaceDevices(signal), staleTime: 15_000, retry: false });
  const notice = devices.isPending ? '正在读取设备…' : devices.isError
    ? devices.data ? '刷新失败，显示上次设备状态' : '设备列表读取失败，请刷新重试'
    : devices.data.length === 0 ? '暂无远程设备' : undefined;

  return <section aria-label="远程连接" className={`mt-4 ${collapsed ? 'w-[52px]' : 'w-full'}`}>
    <div className={`mx-2 mb-1 flex items-center ${collapsed ? 'flex-col gap-1 border-t border-line pt-1' : 'justify-between pl-2'}`}>
      {!collapsed && <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3">远程连接</h2>}
      <button type="button" aria-label="刷新远程设备" title="刷新远程设备" disabled={devices.isFetching} onClick={() => void devices.refetch()}
        className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-ink-3 hover:bg-hover-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-3 disabled:opacity-45">
        <RefreshCw size={13} className={devices.isFetching ? 'animate-spin' : ''} />
      </button>
    </div>
    {notice && <p role="status" title={notice} className={collapsed ? 'sr-only' : 'mx-4 mb-2 text-[12px] text-ink-3'}>{notice}</p>}
    {collapsed && notice && <span aria-hidden="true" title={notice} className="mx-2 flex h-8 items-center justify-center text-[12px] text-ink-3">{devices.isError ? '!' : '·'}</span>}
    <ul className="flex flex-col gap-px">
      {(devices.data ?? []).map(device => {
        const availability = deviceAvailability(device);
        const label = `${device.name} · ${availability}`;
        const reasonId = `${sectionId}-${device.deviceId}`;
        const content = <>
          <Monitor size={18} aria-hidden="true" className="size-5 shrink-0" />
          <span className={collapsed ? 'sr-only' : 'ml-1.5 min-w-0 flex-1'}>
            <span className="block truncate text-[13px] font-medium">{device.name}</span>
            <span id={reasonId} className="block text-[11px] text-ink-3">{availability}</span>
          </span>
        </>;
        const rowClass = `mx-2 flex min-h-10 items-center rounded-[8px] px-2 text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-3 ${collapsed ? 'justify-center' : ''}`;
        return <li key={device.deviceId}>
          {availability === '在线'
            ? <a href={workspaceUrl(device.deviceId)} target="_blank" rel="noopener noreferrer" onClick={onOpen} aria-label={`${label}，在新标签页打开`} title={`${label}，在新标签页打开`} className={`${rowClass} hover:bg-hover-2 hover:text-ink`}>{content}</a>
            : <div tabIndex={0} aria-disabled="true" aria-label={device.name} aria-describedby={reasonId} title={label} className={`${rowClass} opacity-55`}>{content}</div>}
        </li>;
      })}
    </ul>
  </section>;
}
