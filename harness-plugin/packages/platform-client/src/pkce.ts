/**
 * [INPUT]: 依赖 Node crypto 生成 PKCE entropy，依赖 node:http 监听 127.0.0.1 回环 callback
 * [OUTPUT]: 对外提供 createPkceS256、startLoopbackCallback 与稳定 PkceLoopbackError
 * [POS]: platform-client 的浏览器登录事务原语，只管理 verifier/state/callback 生命周期，不接触平台 Token
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'

/** Stable local failures consumed by the platform-client state machine. */
export type PkceLoopbackErrorCode =
  | 'ENT_AUTH_CANCELLED'
  | 'ENT_AUTH_CALLBACK_INVALID'
  | 'ENT_AUTH_STATE_INVALID'
  | 'ENT_AUTH_TIMEOUT'

/** Error carrying a machine-readable login failure without secrets. */
export class PkceLoopbackError extends Error {
  constructor(
    readonly code: PkceLoopbackErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PkceLoopbackError'
  }
}

/** One RFC 7636 S256 verifier/challenge pair. */
export interface PkceS256Pair {
  readonly verifier: string
  readonly challenge: string
  readonly method: 'S256'
}

/** Materialized callback returned by the system browser. */
export interface LoopbackCallbackResult {
  readonly code: string
  readonly state: string
}

/** Running loopback listener and its single settlement promise. */
export interface LoopbackCallback {
  readonly redirectUri: string
  readonly result: Promise<LoopbackCallbackResult>
  cancel(): void
}

export interface LoopbackCallbackOptions {
  readonly expectedState: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

/** Create a verifier with 256 bits of entropy and its base64url SHA-256 challenge. */
export function createPkceS256(entropy: Uint8Array = randomBytes(32)): PkceS256Pair {
  if (entropy.byteLength < 32) {
    throw new TypeError('PKCE entropy must contain at least 32 bytes')
  }
  const verifier = Buffer.from(entropy).toString('base64url')
  if (verifier.length < 43 || verifier.length > 128) {
    throw new TypeError('PKCE verifier must contain 43 to 128 ASCII characters')
  }
  return {
    verifier,
    challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'),
    method: 'S256',
  }
}

/** Start an exact `/callback` loopback listener bound only to IPv4 localhost. */
export async function startLoopbackCallback(
  options: LoopbackCallbackOptions,
): Promise<LoopbackCallback> {
  if (options.expectedState.length === 0) throw new TypeError('expectedState is required')
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive safe integer')
  }

  let server: Server
  let settled = false
  let resolveResult!: (value: LoopbackCallbackResult) => void
  let rejectResult!: (reason: PkceLoopbackError) => void
  const result = new Promise<LoopbackCallbackResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  const stop = (): void => {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', cancel)
    server.closeAllConnections()
    server.close()
  }
  const settleFailure = (error: PkceLoopbackError): void => {
    if (settled) return
    settled = true
    rejectResult(error)
    stop()
  }
  const cancel = (): void => {
    settleFailure(new PkceLoopbackError('ENT_AUTH_CANCELLED', 'PKCE login was cancelled'))
  }
  const timeout = setTimeout(() => {
    settleFailure(new PkceLoopbackError('ENT_AUTH_TIMEOUT', 'PKCE callback timed out'))
  }, options.timeoutMs)

  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method !== 'GET' || url.pathname !== '/callback') {
      response.writeHead(404).end()
      return
    }
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    if (state !== options.expectedState) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Invalid login state')
      settleFailure(new PkceLoopbackError('ENT_AUTH_STATE_INVALID', 'PKCE callback state mismatch'))
      return
    }
    if (code === null || code.length === 0) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Missing authorization code')
      settleFailure(new PkceLoopbackError('ENT_AUTH_CALLBACK_INVALID', 'PKCE callback code is missing'))
      return
    }
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Login completed. You can close this window.')
    if (settled) return
    settled = true
    resolveResult({ code, state })
    stop()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  }).catch((cause: unknown) => {
    clearTimeout(timeout)
    throw cause
  })

  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted === true) cancel()
  const address = server.address()
  if (address === null || typeof address === 'string') {
    cancel()
    throw new Error('PKCE loopback listener did not expose a TCP port')
  }

  return {
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    result,
    cancel,
  }
}
