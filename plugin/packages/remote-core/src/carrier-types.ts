/**
 * [INPUT]: 依赖标准 Web Streams、Headers 与密文 carrier 的头部类型。
 * [OUTPUT]: 提供 Host/浏览器共用的 HTTP/mux 契约、路径与头部边界，以及标准 base64。
 * [POS]: remote-core 的平台适配契约；不触及 Host 文件权限或原生 WebSocket。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { CarrierHeaders } from './carrier.js'

export interface DshFetchInit {
  readonly method: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: ReadableStream<Uint8Array>
  readonly signal?: AbortSignal
}
export interface RemoteDshMux {
  send(data: string): Promise<void>
  readonly messages: AsyncIterable<string>
  close(code?: number): void | Promise<void>
}
export interface DshCarrier {
  readonly signal?: AbortSignal
  fetch(path: string, init: DshFetchInit): Promise<Response>
  openMux(): Promise<RemoteDshMux>
  close(): void
}
export function safeHeaders(headers: Headers): CarrierHeaders {
  const result: CarrierHeaders = {}
  for (const name of ['content-type', 'accept', 'range', 'content-range', 'accept-ranges'] as const) {
    const value = headers.get(name)
    if (value !== null && value.length <= 1024) result[name] = value
  }
  return result
}

export function dshPath(path: string): URL {
  const pathname = path.split('?')[0]!
  if (!path.startsWith('/api/') || pathname.includes('\\') || path.includes('#') || /%2f|%5c|%00/i.test(pathname)) throw new Error('ENT_REMOTE_DENIED')
  const url = new URL(path, 'http://remote.invalid')
  if (url.origin !== 'http://remote.invalid' || url.pathname !== pathname) throw new Error('ENT_REMOTE_DENIED')
  return url
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
export function decodeBase64(value: string, max: number): Uint8Array {
  if (value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('ENT_REMOTE_FRAME_LIMIT')
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0))
  if (bytes.length > max) throw new Error('ENT_REMOTE_FRAME_LIMIT')
  return bytes
}

export function remoteUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 15) | 64
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
