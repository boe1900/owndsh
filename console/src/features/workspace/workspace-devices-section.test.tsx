/**
 * [INPUT]: 依赖 Testing Library、Vitest、TanStack Query、coss UI Menu 原生组件与 WorkspaceDevicesMenuGroup / useWorkspaceDevicesQuery。
 * [OUTPUT]: 验证远程设备菜单分组在有在线设备、全离线、空列表、失败重试与刷新交互下的汇总统计、排序直连与降级呈现。
 * [POS]: workspace 的 Console 账号菜单远程连接分组行为门禁，防止空态隐藏或离线设备误导。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import type { RemoteDevice } from './workspace-api';
import { WorkspaceDevicesMenuGroup, useWorkspaceDevicesQuery } from './workspace-devices-section';

const listWorkspaceDevicesMock = vi.fn();

vi.mock('./workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspace-api')>();
  return {
    ...actual,
    listWorkspaceDevices: (...args: Parameters<typeof actual.listWorkspaceDevices>) => listWorkspaceDevicesMock(...args)
  };
});

function device(overrides: Partial<RemoteDevice> & Pick<RemoteDevice, 'deviceId' | 'name'>): RemoteDevice {
  return {
    installationId: 'inst-1',
    platform: 'darwin-arm64',
    status: 'ACTIVE',
    online: false,
    remoteEnabled: false,
    capabilities: ['remote.connect', 'host.describe'],
    capabilityRevision: 1,
    lastPresenceAt: null,
    revision: 1,
    ...overrides
  };
}

function MenuHarness({ onOpen }: { onOpen?: () => void }) {
  const devices = useWorkspaceDevicesQuery('member-1');
  return (
    <Menu>
      <MenuTrigger render={<button type="button" />}>
        账号菜单 · {devices.onlineCount}/{devices.totalCount} 在线
      </MenuTrigger>
      <MenuPopup>
        <WorkspaceDevicesMenuGroup state={devices} onOpen={onOpen} />
      </MenuPopup>
    </Menu>
  );
}

function renderDevicesMenu(onOpen?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MenuHarness onOpen={onOpen} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  listWorkspaceDevicesMock.mockReset();
});

describe('WorkspaceDevicesMenuGroup', () => {
  it('orders online device links first and notifies onOpen when clicked', async () => {
    const onOpen = vi.fn();
    listWorkspaceDevicesMock.mockResolvedValue([
      device({ deviceId: 'dev-off', name: 'localhost', online: false, remoteEnabled: false }),
      device({ deviceId: 'dev-on', name: 'coladeMac-mini', online: true, remoteEnabled: true }),
      device({ deviceId: 'dev-off2', name: 'Linux-Box', online: true, remoteEnabled: false })
    ]);

    renderDevicesMenu(onOpen);

    const trigger = await screen.findByRole('button', { name: '账号菜单 · 1/3 在线' });
    fireEvent.click(trigger);

    const onlineLink = await screen.findByRole('menuitem', { name: 'coladeMac-mini · 在线，在新标签页打开' });
    expect(onlineLink.tagName).toBe('A');
    expect(onlineLink.getAttribute('target')).toBe('_blank');
    expect(onlineLink.getAttribute('href')).toBe('/workspace.html?deviceId=dev-on');

    const items = screen.getAllByRole('menuitem');
    expect(items[0].textContent).toContain('coladeMac-mini');
    expect(screen.getByText('远控未开启')).toBeTruthy();
    expect(screen.getByText('离线')).toBeTruthy();

    fireEvent.click(onlineLink);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows unavailable status for offline and disabled devices', async () => {
    listWorkspaceDevicesMock.mockResolvedValue([
      device({ deviceId: 'dev-1', name: 'localhost', online: false }),
      device({ deviceId: 'dev-2', name: 'office-pc', online: true, remoteEnabled: false })
    ]);

    renderDevicesMenu();

    const trigger = await screen.findByRole('button', { name: '账号菜单 · 0/2 在线' });
    fireEvent.click(trigger);

    expect(await screen.findByText('office-pc')).toBeTruthy();
    expect(screen.getByText('远控未开启')).toBeTruthy();
    expect(screen.getByText('离线')).toBeTruthy();
  });

  it('shows empty guidance when user has no remote devices', async () => {
    listWorkspaceDevicesMock.mockResolvedValue([]);

    renderDevicesMenu();

    const trigger = await screen.findByRole('button', { name: '账号菜单 · 0/0 在线' });
    fireEvent.click(trigger);

    expect(await screen.findByText('暂无远程设备')).toBeTruthy();
    expect(screen.getByText('在桌面客户端登录并开启远控后，设备会出现在这里。')).toBeTruthy();
  });

  it('shows error state and retries loading when device query fails', async () => {
    listWorkspaceDevicesMock
      .mockRejectedValueOnce(new Error('ENT_PLATFORM_UNAVAILABLE'))
      .mockResolvedValueOnce([
        device({ deviceId: 'dev-on', name: 'coladeMac-mini', online: true, remoteEnabled: true })
      ]);

    renderDevicesMenu();

    const trigger = await screen.findByRole('button', { name: '账号菜单 · 0/0 在线' });
    fireEvent.click(trigger);

    expect(await screen.findByText('设备列表读取失败，请刷新重试')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));

    expect(await screen.findByRole('menuitem', { name: 'coladeMac-mini · 在线，在新标签页打开' })).toBeTruthy();
  });

  it('supports manual refresh without closing the group', async () => {
    listWorkspaceDevicesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        device({ deviceId: 'dev-on', name: 'coladeMac-mini', online: true, remoteEnabled: true })
      ]);

    renderDevicesMenu();

    const trigger = await screen.findByRole('button', { name: '账号菜单 · 0/0 在线' });
    fireEvent.click(trigger);
    expect(await screen.findByText('暂无远程设备')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '刷新远程设备' }));
    expect(await screen.findByRole('menuitem', { name: 'coladeMac-mini · 在线，在新标签页打开' })).toBeTruthy();
  });

  it('shows all devices without toggle when count is 3 or fewer, and caps to 2 devices + 查看更多 when > 3', async () => {
    listWorkspaceDevicesMock.mockResolvedValue([
      device({ deviceId: 'dev-1', name: 'mac-1', online: true, remoteEnabled: true }),
      device({ deviceId: 'dev-2', name: 'mac-2', online: true, remoteEnabled: true }),
      device({ deviceId: 'dev-3', name: 'linux-3', online: false }),
      device({ deviceId: 'dev-4', name: 'win-4', online: false })
    ]);

    renderDevicesMenu();

    const trigger = await screen.findByRole('button', { name: '账号菜单 · 2/4 在线' });
    fireEvent.click(trigger);

    expect(await screen.findByText('mac-1')).toBeTruthy();
    expect(screen.getByText('mac-2')).toBeTruthy();
    expect(screen.queryByText('linux-3')).toBeNull();
    expect(screen.queryByText('win-4')).toBeNull();

    const moreButton = screen.getByRole('button', { name: /查看更多/ });
    expect(moreButton.textContent).toContain('+2');
    fireEvent.click(moreButton);

    expect(await screen.findByText('linux-3')).toBeTruthy();
    expect(screen.getByText('win-4')).toBeTruthy();
    const collapseButton = screen.getByRole('button', { name: '收起' });
    fireEvent.click(collapseButton);
    expect(screen.queryByText('linux-3')).toBeNull();
  });
});
