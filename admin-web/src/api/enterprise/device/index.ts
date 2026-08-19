/**
 * [INPUT]: 依赖 OpenAPI 生成的设备 operation 与企业 revision headers
 * [OUTPUT]: 提供设备 cursor 查询、详情和撤销 API
 * [POS]: api/enterprise/device 的管理协议边界，设备状态始终以服务端返回事实为准
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { getDevice } from '@/services/enterprise/getDevice';
import { listDevices } from '@/services/enterprise/listDevices';
import { revokeDevice as generatedRevokeDevice } from '@/services/enterprise/revokeDevice';
import { revisionHeaders } from '../mutation';

export { getDevice, listDevices };
export type EnterpriseDevice = Awaited<ReturnType<typeof getDevice>>['data'];

export function revokeDevice(deviceId: string, revision: number) {
  return generatedRevokeDevice({ deviceId }, { headers: revisionHeaders(revision) });
}
