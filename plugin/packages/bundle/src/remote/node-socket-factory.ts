/**
 * [INPUT]: 依赖 Node Host 的内存 Access Token、`ws` WebSocket client 和 RemoteSocketLike seam。
 * [OUTPUT]: 提供带 Bearer Upgrade header 的 Node WSS factory，不把 Token 写入 URL 或日志。
 * [POS]: bundle/remote 的 Host 与本机 Controller 的网络边界；两者都使用平台内存 Bearer，浏览器不接触 Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import WebSocket from 'ws'
import type { RemoteSocketFactory, RemoteSocketLike } from './server-connection.js'

export function createNodeRemoteSocketFactory(): RemoteSocketFactory {
  return {
    open(url, accessToken, signal) {
      if (accessToken.trim() === '') return Promise.reject(new Error('remote access token is required'))
      if (signal.aborted) return Promise.reject(new DOMException('remote connection aborted', 'AbortError'))
      const parsed = new URL(url)
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
        return Promise.reject(new Error('remote websocket URL is invalid'))
      }
      return new Promise<RemoteSocketLike>((resolve, reject) => {
        let settled = false
        const socket = new WebSocket(url, { maxPayload: 100_000, perMessageDeflate: false, headers: { authorization: `Bearer ${accessToken}` } })
        const abort = () => {
          socket.close(1000, 'remote connection aborted')
          if (!settled) {
            settled = true
            reject(new DOMException('remote connection aborted', 'AbortError'))
          }
        }
        const cleanup = () => signal.removeEventListener('abort', abort)
        signal.addEventListener('abort', abort, { once: true })
        socket.on('open', () => {
          if (settled) return
          settled = true
          cleanup()
          resolve(adapt(socket))
        })
        socket.on('error', (error: unknown) => {
          if (!settled) {
            settled = true
            cleanup()
            reject(error instanceof Error ? error : new Error('remote websocket failed'))
          }
        })
        socket.on('close', () => {
          if (!settled) {
            settled = true
            cleanup()
            reject(new Error('remote websocket closed before open'))
          }
        })
      })
    },
  }
}

function adapt(socket: WebSocket): RemoteSocketLike {
  return {
    send: data => new Promise<void>((resolve, reject) => socket.send(data, error => error ? reject(error) : resolve())),
    close: (code, reason) => socket.close(code, reason),
    addEventListener: (type, listener) => {
      if (type === 'message') socket.on('message', data => listener({ data: typeof data === 'string' ? data : String(data) }))
      else socket.on(type, () => listener({}))
    },
  }
}
