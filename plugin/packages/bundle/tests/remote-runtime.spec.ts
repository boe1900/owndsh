/**
 * [INPUT]: 依赖 RemoteRuntime 的平台状态订阅与 HostBridge 生命周期。
 * [OUTPUT]: 验证登录、刷新、退出、设备撤销和销毁都同步到 Remote presence。
 * [POS]: bundle/remote 的生命周期回归，避免远控开关停在过期状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import { RemoteRuntime } from '../src/remote/remote-runtime.js'
import type { HostBridge } from '../src/remote/host-bridge.js'

function bridge(initial: HostBridge['presence'] extends () => infer T ? T : never): HostBridge {
  let state = initial
  let enabled = true
  return {
    capabilities: () => ({ protocolVersion: 1, capabilities: ['remote.connect', 'host.describe'] }),
    remoteEnabled: () => enabled,
    setRemoteEnabled: next => { enabled = next },
    presence: () => state,
    setPresence: next => { state = next },
    resetAfterExplicitRecovery: () => { if (state === 'REVOKED') state = 'SIGNED_OUT' },
    close: () => { if (state !== 'REVOKED') state = 'SIGNED_OUT' },
  }
}

class FakeSocket {
  readonly sent: string[] = []
  readonly closed: { code?: number; reason?: string }[] = []
  private readonly listeners = new Map<string, (event: any) => void>()

  send(data: string): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason })
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.set(type, listener)
  }

  emit(type: string, event: unknown): void {
    this.listeners.get(type)?.(event)
  }
}

describe('RemoteRuntime', () => {
  it('mirrors platform lifecycle and closes on dispose', () => {
    let listener: ((status: any) => void) | undefined
    const platform = {
      status: vi.fn(() => ({ state: 'SIGNED_OUT' })),
      subscribe: vi.fn((next: (status: any) => void) => { listener = next; return () => { listener = undefined } }),
    }
    const host = bridge('SIGNED_OUT')
    const runtime = new RemoteRuntime(platform as any, { info: vi.fn(), warn: vi.fn() } as any, host)

    runtime.start()
    listener?.({ state: 'READY' })
    expect(host.presence()).toBe('READY')
    listener?.({ state: 'REFRESHING' })
    expect(host.presence()).toBe('REFRESHING')
    listener?.({ state: 'DEVICE_REVOKED' })
    expect(host.presence()).toBe('REVOKED')
    runtime.dispose()
    expect(host.presence()).toBe('REVOKED')
  })

  it('notifies the platform owner when the carrier reports device revocation', async () => {
    let listener: ((status: any) => void) | undefined
    let status: any = { state: 'READY' }
    const socket = new FakeSocket()
    const platform = {
      status: vi.fn(() => status),
      subscribe: vi.fn((next: (status: any) => void) => { listener = next; return () => { listener = undefined } }),
      remoteSession: vi.fn(async () => ({
        platformUrl: 'http://platform.example',
        accessToken: 'access-token',
        deviceId: '90018',
        installationId: '11111111-1111-4111-8111-111111111111',
      })),
      markDeviceRevoked: vi.fn(() => {
        status = { state: 'DEVICE_REVOKED' }
        listener?.(status)
      }),
    }
    const host = bridge('SIGNED_OUT')
    const runtime = new RemoteRuntime(platform as any, { info: vi.fn(), warn: vi.fn() } as any, host, {
      socketFactory: { open: vi.fn(async () => socket) },
    })

    runtime.start()
    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0))
    socket.emit('message', { data: JSON.stringify({
      v: 1,
      type: 'error',
      id: 'rf_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      ts: 1,
      payload: { code: 'ENT_DEVICE_REVOKED', message: 'device revoked', retryable: false },
    }) })

    expect(platform.markDeviceRevoked).toHaveBeenCalledOnce()
    expect(host.presence()).toBe('REVOKED')
    expect(socket.closed).toContainEqual({ code: 4003, reason: 'REVOKED' })
    listener?.({ state: 'SIGNED_OUT' })
    expect(host.presence()).toBe('REVOKED')
    runtime.dispose()
  })
})
