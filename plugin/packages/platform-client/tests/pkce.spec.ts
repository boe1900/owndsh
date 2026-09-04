/**
 * [INPUT]: 依赖 platform-client PKCE 公开入口与 Node fetch/crypto 测试运行时
 * [OUTPUT]: 验证 S256、127.0.0.1 callback、state、取消和超时的自动化证据
 * [POS]: platform-client 登录事务回归测试，锁定系统浏览器回环协议的安全边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createPkceS256,
  PkceLoopbackError,
  startLoopbackCallback,
} from '../src/index.js'

describe('PKCE S256', () => {
  it('derives a standards-compliant verifier and challenge', () => {
    const pair = createPkceS256(new Uint8Array(32).fill(7))
    expect(pair.method).toBe('S256')
    expect(pair.verifier).toHaveLength(43)
    expect(pair.challenge).toBe(
      createHash('sha256').update(pair.verifier, 'ascii').digest('base64url'),
    )
  })

  it('accepts one exact loopback callback with the expected state', async () => {
    const callback = await startLoopbackCallback({ expectedState: 'state-1', timeoutMs: 1_000 })
    expect(callback.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    const response = await fetch(`${callback.redirectUri}?code=code-1&state=state-1`)
    expect(response.status).toBe(200)
    await expect(callback.result).resolves.toEqual({ code: 'code-1', state: 'state-1' })
  })

  it('rejects a mismatched state and closes the transaction', async () => {
    const callback = await startLoopbackCallback({ expectedState: 'expected', timeoutMs: 1_000 })
    const result = callback.result.catch((error: unknown) => error)
    expect((await fetch(`${callback.redirectUri}?code=code-1&state=forged`)).status).toBe(400)
    const error = await result
    expect(error).toBeInstanceOf(PkceLoopbackError)
    expect((error as PkceLoopbackError).code).toBe('ENT_AUTH_STATE_INVALID')
  })

  it('settles cancellation and timeout with stable codes', async () => {
    const cancelled = await startLoopbackCallback({ expectedState: 'state', timeoutMs: 1_000 })
    const cancelledResult = cancelled.result.catch((error: unknown) => error)
    cancelled.cancel()
    expect((await cancelledResult as PkceLoopbackError).code).toBe('ENT_AUTH_CANCELLED')

    const timedOut = await startLoopbackCallback({ expectedState: 'state', timeoutMs: 10 })
    await expect(timedOut.result).rejects.toMatchObject({ code: 'ENT_AUTH_TIMEOUT' })
  })
})
