/**
 * [INPUT]: 依赖已经完成 Noise/lease 的密文发送边界、字节信用流和 Host 原生 carrier。
 * [OUTPUT]: 提供 HTTP 请求/响应流与原生 WS 文本 mux 的双端隧道，取消后丢弃在途尾帧。
 * [POS]: remote 链路的业务 carrier；每通道有界，不重试 mutation，不解释原生 RPC 结果。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { deferred, type Deferred, CarrierPipe, MAX_CARRIER_CHANNELS, MAX_MUX_MESSAGE_BYTES, type CarrierFrame, type CarrierSender } from '@owndsh/remote-core'
import type { DshCarrier, DshFetchInit, RemoteDshMux } from './dsh-carrier.js'
import { safeHeaders } from './dsh-carrier.js'
import { dshPath } from './dsh-policy.js'

interface Channel {
  readonly pipe: CarrierPipe
  readonly abort: AbortController
  readonly response: Deferred<Extract<CarrierFrame, { kind: 'http.response' | 'mux.ready' }>>
  cleanup(): void
}
export class CarrierTunnel {
  private readonly channels = new Map<string, Channel>()
  private hostMux: string | undefined
  constructor(private readonly sender: CarrierSender, private readonly signal: AbortSignal, private readonly carrier?: DshCarrier) {
    signal.addEventListener('abort', () => {
      for (const channel of this.channels.values()) { channel.abort.abort(); channel.pipe.abort(); channel.response.reject(new Error('ENT_REMOTE_CLOSED')); channel.cleanup() }
      this.channels.clear()
      carrier?.close()
    }, { once: true })
  }

  receive(frame: CarrierFrame): void {
    this.signal.throwIfAborted()
    if (frame.kind === 'ready') return
    if (frame.kind === 'http.open' || frame.kind === 'mux.open') {
      if (!this.carrier) throw new Error('ENT_REMOTE_DIRECTION')
      const channel = this.add(frame.id)
      void this.serve(frame, channel).catch(() => {
        if (this.signal.aborted || channel.abort.signal.aborted) return
        void this.send({ kind: 'error', id: frame.id, code: 'ENT_REMOTE_DENIED' }).finally(() => this.remove(frame.id)).catch(() => {})
      })
      return
    }
    const channel = this.channels.get(frame.id)
    if (!channel) return
    switch (frame.kind) {
      case 'data': channel.pipe.receive(frame); break
      case 'credit': channel.pipe.replenish(frame.bytes); break
      case 'end': channel.pipe.end(); break
      case 'cancel': this.remove(frame.id); break
      case 'error': channel.response.reject(new Error(frame.code)); this.remove(frame.id); break
      case 'http.response': case 'mux.ready':
        if (this.carrier) throw new Error('ENT_REMOTE_DIRECTION')
        channel.response.resolve(frame); break
    }
  }

  async fetch(path: string, init: DshFetchInit): Promise<Response> {
    this.signal.throwIfAborted()
    init.signal?.throwIfAborted()
    dshPath(path)
    if (init.method !== 'GET' && init.method !== 'HEAD' && init.method !== 'POST') throw new Error('ENT_REMOTE_DENIED')
    const channel = this.add(crypto.randomUUID())
    const id = channel.pipe.id
    this.bindAbort(id, channel, init.signal)
    try {
      await this.send({ kind: 'http.open', id, path, method: init.method, headers: safeHeaders(new Headers(init.headers)) })
      void this.sendBody(channel, init.body).catch(() => this.cancel(id))
      const frame = await channel.response.promise
      if (frame.kind !== 'http.response') throw new Error('ENT_REMOTE_PROTOCOL')
      const body = this.responseBody(channel)
      if (init.method === 'HEAD' || frame.status === 204 || frame.status === 205 || frame.status === 304) {
        await body.cancel(); return new Response(null, { status: frame.status, headers: frame.headers })
      }
      return new Response(body, { status: frame.status, headers: frame.headers })
    } catch (error) { this.cancel(id); throw error }
  }

  async openMux(): Promise<RemoteDshMux> {
    const channel = this.add(crypto.randomUUID())
    const id = channel.pipe.id
    await this.send({ kind: 'mux.open', id })
    const frame = await channel.response.promise
    if (frame.kind !== 'mux.ready') { this.cancel(id); throw new Error('ENT_REMOTE_PROTOCOL') }
    let pending = 0
    let tail = Promise.resolve()
    return {
      send: text => {
        const bytes = new TextEncoder().encode(text)
        if (!bytes.length || pending + bytes.length > MAX_MUX_MESSAGE_BYTES) return Promise.reject(new Error('ENT_REMOTE_LIMIT'))
        pending += bytes.length
        const task = tail.then(() => channel.pipe.write(bytes))
        tail = task.catch(() => {})
        return task.finally(() => { pending -= bytes.length })
      },
      messages: muxMessages(channel.pipe, () => this.cancel(id)),
      close: () => this.cancel(id),
    }
  }

  private send(frame: CarrierFrame): Promise<void> { this.signal.throwIfAborted(); return this.sender(frame) }

  private add(id: string): Channel {
    this.signal.throwIfAborted()
    if (this.channels.size >= MAX_CARRIER_CHANNELS || this.channels.has(id)) throw new Error('ENT_REMOTE_LIMIT')
    const response = deferred<Extract<CarrierFrame, { kind: 'http.response' | 'mux.ready' }>>()
    void response.promise.catch(() => {})
    const channel = { pipe: new CarrierPipe(id, frame => this.send(frame)), abort: new AbortController(), response, cleanup() {} }
    this.channels.set(id, channel)
    return channel
  }
  private bindAbort(id: string, channel: Channel, signal?: AbortSignal): void {
    if (!signal) return
    const abort = () => this.cancel(id)
    signal.addEventListener('abort', abort, { once: true })
    channel.cleanup = () => signal.removeEventListener('abort', abort)
    if (signal.aborted) abort()
  }
  private remove(id: string): void {
    const channel = this.channels.get(id)
    if (!channel) return
    this.channels.delete(id)
    channel.abort.abort()
    channel.pipe.abort()
    channel.response.reject(new Error('ENT_REMOTE_CLOSED'))
    channel.cleanup()
  }
  private cancel(id: string): void {
    if (!this.channels.has(id)) return
    if (!this.signal.aborted) void this.send({ kind: 'cancel', id }).catch(() => {})
    this.remove(id)
  }
  private responseBody(channel: Channel): ReadableStream<Uint8Array> {
    const reader = channel.pipe.read()
    return new ReadableStream({
      pull: async controller => {
        try {
          const next = await reader.next()
          if (next.done) { controller.close(); this.cancel(channel.pipe.id) }
          else controller.enqueue(next.value.bytes)
        } catch (error) { controller.error(error); this.cancel(channel.pipe.id) }
      },
      cancel: () => { this.cancel(channel.pipe.id); void reader.return(undefined).catch(() => {}) },
    }, { highWaterMark: 0 })
  }
  private async sendBody(channel: Channel, body?: ReadableStream<Uint8Array>): Promise<void> {
    if (body) {
      const reader = body.getReader()
      const abort = () => { void reader.cancel().catch(() => {}) }
      channel.abort.signal.addEventListener('abort', abort, { once: true })
      try {
        while (!channel.abort.signal.aborted) {
          const part = await reader.read()
          if (part.done) break
          await channel.pipe.write(part.value)
        }
      } finally { channel.abort.signal.removeEventListener('abort', abort); reader.releaseLock() }
    }
    channel.abort.signal.throwIfAborted()
    await this.send({ kind: 'end', id: channel.pipe.id })
  }
  private async serve(frame: Extract<CarrierFrame, { kind: 'http.open' | 'mux.open' }>, channel: Channel): Promise<void> {
    const carrier = this.carrier
    if (!carrier) throw new Error('ENT_REMOTE_DIRECTION')
    const signal = AbortSignal.any([this.signal, channel.abort.signal])
    if (frame.kind === 'http.open') {
      const response = await carrier.fetch(frame.path, { method: frame.method, headers: frame.headers, signal,
        ...(frame.method === 'POST' ? { body: channel.pipe.stream(() => this.cancel(frame.id)) } : {}) })
      signal.throwIfAborted()
      await this.send({ kind: 'http.response', id: frame.id, status: response.status, headers: safeHeaders(response.headers) })
      await this.sendBody(channel, response.body ?? undefined)
    } else {
      if (this.hostMux !== undefined) throw new Error('ENT_REMOTE_MUX_BUSY')
      this.hostMux = frame.id
      const mux = await carrier.openMux()
      signal.addEventListener('abort', () => { void mux.close() }, { once: true })
      await this.send({ kind: 'mux.ready', id: frame.id })
      try {
        await Promise.all([
          (async () => { for await (const text of muxMessages(channel.pipe)) await mux.send(text) })(),
          (async () => { for await (const text of mux.messages) { const bytes = new TextEncoder().encode(text); if (bytes.length > MAX_MUX_MESSAGE_BYTES) throw new Error('ENT_REMOTE_LIMIT'); await channel.pipe.write(bytes) } })(),
        ])
      } finally { void mux.close(); this.cancel(frame.id) }
    }
  }
}

async function* muxMessages(pipe: CarrierPipe, close?: () => void): AsyncGenerator<string> {
  let pieces: Uint8Array[] = []
  let length = 0
  try {
    for await (const chunk of pipe.read()) {
      length += chunk.bytes.length
      if (length > MAX_MUX_MESSAGE_BYTES) throw new Error('ENT_REMOTE_LIMIT')
      pieces.push(chunk.bytes)
      if (chunk.last) {
        const bytes = new Uint8Array(length)
        let offset = 0
        for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length }
        yield new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        pieces = []; length = 0
      }
    }
    if (length !== 0) throw new Error('ENT_REMOTE_TRUNCATED')
  } finally { close?.() }
}
