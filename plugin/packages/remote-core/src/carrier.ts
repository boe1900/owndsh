/**
 * [INPUT]: 依赖 Zod 边界校验与 Web Streams；每条明文进入 Noise 后才允许 relay。
 * [OUTPUT]: 提供有限 carrier 帧、逐流字节信用和有界读取队列。
 * [POS]: remote-core 的流量控制层；HTTP 与原生 mux 共用字节流，不解释业务 RPC。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod'
export const CARRIER_CHUNK_BYTES = 24_576
export const CARRIER_WINDOW_BYTES = CARRIER_CHUNK_BYTES * 4
export const MAX_CARRIER_CHANNELS = 32
export const MAX_MUX_MESSAGE_BYTES = 4 * 1024 * 1024
const id = z.string().regex(/^[a-z0-9-]{1,64}$/)
const headers = z.partialRecord(z.enum(['content-type', 'accept', 'range', 'content-range', 'accept-ranges']), z.string().max(1024))
export const carrierFrameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), version: z.literal('0.2.1-rc.5') }).strict(),
  z.object({ kind: z.literal('http.open'), id, path: z.string().max(8192).startsWith('/api/'), method: z.enum(['GET', 'HEAD', 'POST']), headers }).strict(),
  z.object({ kind: z.literal('http.response'), id, status: z.number().int().min(200).max(599), headers }).strict(),
  z.object({ kind: z.literal('mux.open'), id }).strict(),
  z.object({ kind: z.literal('mux.ready'), id }).strict(),
  z.object({ kind: z.literal('data'), id, bytes: z.string().max(32768), last: z.boolean() }).strict(),
  z.object({ kind: z.literal('credit'), id, bytes: z.number().int().positive().max(CARRIER_WINDOW_BYTES) }).strict(),
  z.object({ kind: z.literal('end'), id }).strict(),
  z.object({ kind: z.literal('cancel'), id }).strict(),
  z.object({ kind: z.literal('error'), id, code: z.enum(['ENT_REMOTE_DENIED', 'ENT_REMOTE_UNAVAILABLE', 'ENT_REMOTE_LIMIT']) }).strict(),
])
export type CarrierFrame = z.infer<typeof carrierFrameSchema>
export type CarrierHeaders = z.infer<typeof headers>
export type CarrierData = Extract<CarrierFrame, { kind: 'data' }>
export type CarrierSender = (frame: CarrierFrame) => Promise<void>

export function encodeCarrierFrame(frame: CarrierFrame): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(carrierFrameSchema.parse(frame)))
  if (bytes.length > 65_520) throw new Error('ENT_REMOTE_FRAME_LIMIT')
  return bytes
}
export function decodeCarrierFrame(bytes: Uint8Array): CarrierFrame {
  if (bytes.length > 65_520) throw new Error('ENT_REMOTE_FRAME_LIMIT')
  return carrierFrameSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
}
export function encodeBytes(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)) }
export function decodeBytes(value: string): Uint8Array {
  if (value.length > 32768 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('ENT_REMOTE_FRAME_LIMIT')
  return Uint8Array.from(atob(value), byte => byte.charCodeAt(0))
}

/** 单消费方流：信用只在消费后返回，网络回调不能无界堆积。 */
export class CarrierPipe {
  private credit = CARRIER_WINDOW_BYTES
  private received = 0
  private queue: { bytes: Uint8Array; last: boolean }[] = []
  private ended = false
  private failure: Error | undefined
  private wakeRead: (() => void) | undefined
  private wakeWrite: (() => void) | undefined
  private writing = false
  constructor(readonly id: string, private readonly send: CarrierSender) {}

  receive(frame: CarrierData): void {
    const bytes = decodeBytes(frame.bytes)
    if (this.ended || !bytes.length || this.received + bytes.length > CARRIER_WINDOW_BYTES) throw new Error('ENT_REMOTE_CREDIT')
    this.received += bytes.length
    this.queue.push({ bytes, last: frame.last })
    this.wakeRead?.()
  }
  replenish(bytes: number): void {
    if (this.credit + bytes > CARRIER_WINDOW_BYTES) throw new Error('ENT_REMOTE_CREDIT')
    this.credit += bytes
    this.wakeWrite?.()
  }
  end(): void { this.ended = true; this.wakeRead?.() }
  abort(error = new Error('ENT_REMOTE_CLOSED')): void {
    this.failure = error
    this.queue.length = 0
    this.wakeRead?.()
    this.wakeWrite?.()
  }
  async write(bytes: Uint8Array, last = true): Promise<void> {
    if (this.writing) throw new Error('ENT_REMOTE_CONCURRENT_WRITE')
    this.writing = true
    try {
      for (let offset = 0; offset < bytes.length;) {
        while (this.credit === 0 && !this.failure) await new Promise<void>(resolve => { this.wakeWrite = resolve })
        if (this.failure) throw this.failure
        const size = Math.min(CARRIER_CHUNK_BYTES, this.credit, bytes.length - offset)
        this.credit -= size
        await this.send({ kind: 'data', id: this.id, bytes: encodeBytes(bytes.subarray(offset, offset + size)), last: last && offset + size === bytes.length })
        offset += size
      }
    } finally { this.writing = false }
  }
  async *read(): AsyncGenerator<{ bytes: Uint8Array; last: boolean }> {
    while (true) {
      if (this.failure) throw this.failure
      const chunk = this.queue.shift()
      if (chunk !== undefined) {
        yield chunk
        if (this.failure) throw this.failure
        this.received -= chunk.bytes.length
        await this.send({ kind: 'credit', id: this.id, bytes: chunk.bytes.length })
      } else {
        if (this.ended) return
        await new Promise<void>(resolve => { this.wakeRead = resolve })
      }
    }
  }
  stream(cancel: () => void): ReadableStream<Uint8Array> {
    const iterator = this.read()
    return new ReadableStream({
      async pull(controller) {
        try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(next.value.bytes) }
        catch (error) { controller.error(error) }
      },
      cancel() { cancel(); void iterator.return(undefined).catch(() => {}) },
    }, { highWaterMark: 0 })
  }
}

export interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; reject(error: Error): void }
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
