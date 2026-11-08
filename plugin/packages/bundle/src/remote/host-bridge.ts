/**
 * [INPUT]: 依赖 Harness host 的最小只读状态，刻意不依赖 Typert provider 或 connection。
 * [OUTPUT]: 对外提供 Remote 可见的 Host capability、粘性撤权状态和显式恢复入口。
 * [POS]: bundle/remote 的业务隔离边界；后续 session/file/terminal 才能在此之后接入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { probeHostCapabilities, type HostCapabilityDescriptor } from './capability-probe.js'

export type HostRemotePresence = 'READY' | 'REFRESHING' | 'SIGNED_OUT' | 'REVOKED'

export interface HostBridge {
  capabilities(): HostCapabilityDescriptor
  remoteEnabled(): boolean
  setRemoteEnabled(enabled: boolean): void
  presence(): HostRemotePresence
  setPresence(state: HostRemotePresence): void
  resetAfterExplicitRecovery(): void
  close(): void
}

export class DefaultHostBridge implements HostBridge {
  private state: HostRemotePresence = 'SIGNED_OUT'
  private enabled: boolean

  constructor(remoteEnabled = true) {
    this.enabled = remoteEnabled
  }

  capabilities(): HostCapabilityDescriptor {
    return probeHostCapabilities()
  }

  remoteEnabled(): boolean {
    return this.enabled
  }

  setRemoteEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  presence(): HostRemotePresence {
    return this.state
  }

  setPresence(state: HostRemotePresence): void {
    if (this.state === 'REVOKED' && state !== 'REVOKED') return
    this.state = state
  }

  resetAfterExplicitRecovery(): void {
    if (this.state === 'REVOKED') this.state = 'SIGNED_OUT'
  }

  close(): void {
    if (this.state !== 'REVOKED') this.state = 'SIGNED_OUT'
  }
}
