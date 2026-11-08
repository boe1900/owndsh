/**
 * [INPUT]: 依赖 EnterprisePlatformService 状态/短期 carrier 会话、HostBridge、RemoteSocketFactory 与 Remote URL 派生。
 * [OUTPUT]: 对外提供登录状态驱动的 Remote presence runtime、Host hello/connect.accept、撤权清理和 heartbeat。
 * [POS]: bundle/remote 的生命周期组合器，连接核心与业务 bridge 解耦。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { EnterprisePlatformService } from '@owndsh/platform-client'
import type { Context } from '@deepseek-ai/cordis'
import { DefaultHostBridge, type HostBridge } from './host-bridge.js'
import { RemoteServerConnection, type RemoteHostIdentity, type RemoteSocketFactory } from './server-connection.js'
import { remoteWebSocketUrl } from '@owndsh/contracts'

type RemotePlatform = Pick<EnterprisePlatformService, 'status' | 'subscribe' | 'remoteSession' | 'markDeviceRevoked'>

export class RemoteRuntime {
  private readonly bridge: HostBridge
  private readonly connection: RemoteServerConnection
  private readonly socketFactory: RemoteSocketFactory | undefined
  private readonly identity: Omit<RemoteHostIdentity, 'deviceId'>
  private disposeStatus: (() => void) | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private abort = new AbortController()
  private revocationLatched = false

  constructor(
    private readonly platform: RemotePlatform,
    private readonly logger: Context['logger'],
    bridge: HostBridge | undefined = undefined,
    options: { readonly socketFactory?: RemoteSocketFactory; readonly publicKey?: string; readonly remoteEnabled?: boolean } = {},
  ) {
    this.bridge = bridge ?? new DefaultHostBridge(options.remoteEnabled ?? true)
    this.connection = new RemoteServerConnection({
      onFrame: frame => {
        if (frame.type === 'connect.request') {
          this.connection.send({
            v: 1, type: 'connect.accept', id: frameId(), ts: Date.now(),
            payload: { linkId: frame.payload.linkId, expiresAt: Date.now() + 90_000 },
          })
        }
      },
      onState: state => this.logger.info(`owndsh remote carrier ${state}`),
      onDeviceRevoked: () => {
        this.revocationLatched = true
        this.bridge.setPresence('REVOKED')
        this.platform.markDeviceRevoked()
      },
    })
    this.socketFactory = options.socketFactory
    this.identity = {
      capabilities: ['remote.connect', 'host.describe'],
      ...(options.publicKey === undefined ? {} : { publicKey: options.publicKey }),
    }
  }

  start(): void {
    this.disposeStatus?.()
    this.disposeStatus = this.platform.subscribe(status => {
      const recovering = status.state === 'AUTHORIZING' || status.state === 'ENROLLING' || status.state === 'BOOTSTRAPPING'
      if (recovering && this.revocationLatched) {
        this.revocationLatched = false
        this.connection.resetAfterExplicitRecovery()
        this.bridge.resetAfterExplicitRecovery()
      }
      if (status.state === 'DEVICE_REVOKED') this.revocationLatched = true
      const state: 'READY' | 'REFRESHING' | 'SIGNED_OUT' | 'REVOKED' = this.revocationLatched
        ? 'REVOKED'
        : status.state === 'READY'
          ? 'READY'
          : status.state === 'REFRESHING'
            ? 'REFRESHING' : 'SIGNED_OUT'
      if (state !== this.bridge.presence()) this.logger.info(`owndsh remote presence ${state}`)
      this.bridge.setPresence(state)
      if (state === 'READY' && this.bridge.remoteEnabled()) void this.openCarrier()
      if (state === 'REFRESHING' && this.connection.currentState() === 'READY') {
        this.connection.sendPresence('REFRESHING', this.bridge.capabilities().capabilities, this.bridge.remoteEnabled())
      }
      if (state === 'SIGNED_OUT' || state === 'REVOKED') {
        if (this.connection.currentState() === 'READY') {
          this.connection.sendPresence(state, this.bridge.capabilities().capabilities, false)
        }
        this.connection.close(state === 'REVOKED' ? 4003 : 1000, state)
        this.stopHeartbeat()
      }
      if (state === 'REVOKED') this.logger.warn('owndsh remote carrier closed because device was revoked')
      if (state === 'SIGNED_OUT') this.logger.info('owndsh remote carrier closed because platform session ended')
    })
    const current = this.platform.status()
    if (current.state === 'DEVICE_REVOKED') this.revocationLatched = true
    const state = this.revocationLatched
      ? 'REVOKED'
      : current.state === 'READY' ? 'READY' : current.state === 'REFRESHING' ? 'REFRESHING' : 'SIGNED_OUT'
    this.bridge.setPresence(state)
    if (state === 'READY' && this.bridge.remoteEnabled()) void this.openCarrier()
  }

  dispose(): void {
    this.disposeStatus?.()
    this.disposeStatus = undefined
    this.abort.abort()
    this.connection.close()
    this.stopHeartbeat()
    if (this.revocationLatched) this.bridge.setPresence('REVOKED')
    else this.bridge.close()
  }

  private async openCarrier(): Promise<void> {
    if (this.socketFactory === undefined || this.connection.currentState() !== 'IDLE' && this.connection.currentState() !== 'CLOSED') return
    try {
      const session = await this.platform.remoteSession()
      if (!this.bridge.remoteEnabled()) return
      await this.connection.connect(
        remoteWebSocketUrl(session.platformUrl), session.accessToken, this.socketFactory, this.abort.signal,
        { ...this.identity, deviceId: session.deviceId },
      )
      if (this.revocationLatched || this.platform.status().state !== 'READY'
        || this.bridge.presence() !== 'READY' || !this.bridge.remoteEnabled()
        || this.connection.currentState() === 'REVOKED') {
        this.connection.close(4003, 'REVOKED')
        return
      }
      this.connection.sendPresence('READY', this.bridge.capabilities().capabilities, this.bridge.remoteEnabled())
      this.stopHeartbeat()
      this.heartbeat = setInterval(() => {
        if (this.connection.currentState() === 'READY') this.connection.sendPresence('READY', this.bridge.capabilities().capabilities, this.bridge.remoteEnabled())
      }, 30_000)
      this.heartbeat.unref?.()
    } catch (error) {
      this.logger.warn(`owndsh remote carrier failed ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }
}

function frameId(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `rf_${Array.from({ length: 26 }, (_, index) => alphabet[bytes[index % bytes.length]! & 31]).join('')}`
}
