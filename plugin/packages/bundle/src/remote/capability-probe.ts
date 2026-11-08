/**
 * [INPUT]: 依赖 Host Bridge 的只读 capability 声明和 Remote transport 常量。
 * [OUTPUT]: 对外提供稳定、排序后的首期 Host capability descriptor。
 * [POS]: bundle/remote 的能力边界；首期只证明连接基础，不宣告 session/file/terminal。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { REMOTE_CAPABILITIES, type RemoteCapability } from '@owndsh/contracts'
import { REMOTE_CORE_VERSION } from '@owndsh/remote-core'

export interface HostCapabilityDescriptor {
  readonly protocolVersion: typeof REMOTE_CORE_VERSION
  readonly capabilities: readonly RemoteCapability[]
}

export function probeHostCapabilities(): HostCapabilityDescriptor {
  return { protocolVersion: REMOTE_CORE_VERSION, capabilities: [...REMOTE_CAPABILITIES] }
}
