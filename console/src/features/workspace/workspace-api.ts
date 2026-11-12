/**
 * [INPUT]: 依赖 HttpOnly Cookie、contracts 的本人设备与 ticket schema。
 * [OUTPUT]: 提供本人设备目录、连接快照/准确断开、一次性控制 ticket 与独立工作区 URL。
 * [POS]: workspace 的服务端边界；不读取 Token、不相信 URL 中的账号身份。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { zOwnRemoteTicketResponse, zRemoteDeviceListResponse, zRemoteConnectionResponse, type RemoteDevice, type RemoteTicketRequest } from '@owndsh/contracts';
import { randomUuid } from '@/lib/crypto';
import { createConsoleRemoteTicket, listConsoleRemoteDevices, getConsoleRemoteConnection, disconnectConsoleRemoteConnection } from '@/api/generated/sdk.gen';

export type { RemoteDevice } from '@owndsh/contracts';

export async function workspaceConnection(deviceId: string, signal: AbortSignal): Promise<string | null> {
  const response = await getConsoleRemoteConnection({ path: { deviceId }, signal });
  if (!response.data) throw new Error(response.error?.error.code ?? 'ENT_PLATFORM_UNAVAILABLE');
  return zRemoteConnectionResponse.parse(response.data).data.linkId;
}

export async function disconnectWorkspaceConnection(deviceId: string, expectedLinkId: string, signal: AbortSignal): Promise<void> {
  const response = await disconnectConsoleRemoteConnection({ path: { deviceId }, body: { expectedLinkId }, signal });
  if (!response.data) throw new Error(response.error?.error.code ?? 'ENT_PLATFORM_UNAVAILABLE');
  zRemoteConnectionResponse.parse(response.data);
}

export async function listWorkspaceDevices(signal?: AbortSignal): Promise<RemoteDevice[]> {
  const result: RemoteDevice[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const response = await listConsoleRemoteDevices({ query: { limit: 100, cursor }, signal });
    if (!response.data) throw new Error(response.error?.error.code ?? 'ENT_PLATFORM_UNAVAILABLE');
    const { data } = zRemoteDeviceListResponse.parse(response.data);
    result.push(...data.items);
    if (result.length > 500) throw new Error('ENT_REMOTE_DIRECTORY_LIMIT');
    if (!data.page.hasMore) return result;
    const next = data.page.nextCursor;
    if (!next || cursors.has(next)) throw new Error('ENT_REMOTE_PROTOCOL');
    cursors.add(next);
    cursor = next;
  } while (cursor);
  return result;
}

export async function issueWorkspaceTicket(deviceId: string, identity: Pick<RemoteTicketRequest, 'controllerDeviceId' | 'controllerPublicKey'>, signal: AbortSignal) {
  const response = await createConsoleRemoteTicket({
    path: { deviceId }, signal,
    headers: { 'Idempotency-Key': randomUuid() },
    body: { ...identity, requestedCapabilities: ['remote.connect', 'host.describe'], clientVersion: 'owndsh-console/0.1.0' } satisfies RemoteTicketRequest,
  });
  if (!response.data) throw new Error(response.error?.error.code ?? 'ENT_PLATFORM_UNAVAILABLE');
  return zOwnRemoteTicketResponse.parse(response.data).data;
}

export function workspaceUrl(deviceId: string): string {
  return `/workspace.html?deviceId=${encodeURIComponent(deviceId)}`;
}

export function deviceAvailability(device: RemoteDevice): string {
  if (device.status === 'REVOKED') return '设备已撤销';
  if (!device.online) return '离线';
  if (!device.remoteEnabled) return '远控未开启';
  if (!device.capabilities.includes('remote.connect') || !device.capabilities.includes('host.describe')) return '版本暂不支持';
  return '在线';
}
