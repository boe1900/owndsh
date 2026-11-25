/**
 * [INPUT]: 使用官方 Gateway 的进程内 wireStream，同一 API Peer 和加密 carrier 的大小及分流契约。
 * [OUTPUT]: 提供有界原生 mux、终端 uplink 与按 link 绑定的一次性大消息字节流。
 * [POS]: bundle/remote 的 Host 订阅边界；HTTP 鉴权和 Peer 释放由 dsh-carrier 持有。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import type { TypertGatewayWireStream } from '@deepseek-ai/dsh-api-gateway'
import {
  parseRemoteStreamClientMessage,
  type RemoteStreamClientMessage,
  type RemoteStreamFailure,
} from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import {
  CARRIER_WINDOW_BYTES,
  MAX_MUX_MESSAGE_BYTES,
  MAX_MUX_STREAMS,
  MAX_MUX_TRANSFER_BYTES,
  MUX_TRANSFER_TIMEOUT_MS,
  deferred,
  muxTransferAckSchema,
  muxTransferPath,
  type DshFetchInit,
  type MuxTransferAck,
  type MuxTransferDescriptor,
  type RemoteDshMux,
} from '@owndsh/remote-core'
import { authorizeFilePayload, DSH_STREAM_ENDPOINTS, type WorkspaceCatalog } from './dsh-policy.js'

const MAX_STREAM_ID_BYTES = 128
const MAX_TERMINAL_FRAME_BYTES = 2048
const MAX_UPLINK_BYTES = 262_144

const denied: RemoteStreamFailure = { code: 'gateway/access-denied', message: 'Remote endpoint is unavailable', details: {} }
const limit: RemoteStreamFailure = { code: 'gateway/result-invalid', message: 'Remote stream response exceeds its transport budget', details: {} }
const invalidUplink: RemoteStreamFailure = { code: 'gateway/protocol', message: 'Remote stream uplink item is out of order', details: {} }
const uplinkOverflow: RemoteStreamFailure = { code: 'gateway/uplink-overflow', message: 'Remote stream uplink exceeded its buffered byte budget', details: {} }
const internal: RemoteStreamFailure = { code: 'gateway/internal', message: 'Remote stream failed', details: {} }

type OpenFrame = Extract<RemoteStreamClientMessage, { type: 'open' }>
type Peer = Parameters<TypertGatewayWireStream['open']>[3]
type Output = { text: string; bytes: number; signal: AbortSignal; settle(delivered: boolean): void }
type Diagnostic = (endpoint: string, kind: 'item' | 'snapshot' | 'event', bytes: number) => void
type UplinkEntry = { value: unknown; bytes: number }

class Uplink {
  private controller: ReadableStreamDefaultController<UplinkEntry> | undefined
  private ended = false
  private readonly input = new ReadableStream<UplinkEntry>({
    start: controller => { this.controller = controller },
    cancel: () => { this.controller = undefined },
  }, { highWaterMark: MAX_UPLINK_BYTES, size: entry => entry.bytes })

  readonly values: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]: () => {
      const reader = this.input.getReader()
      let finished = false
      const done: IteratorReturnResult<undefined> = { done: true, value: undefined }
      const release = () => {
        if (finished) return
        finished = true
        reader.releaseLock()
      }
      return {
        async next() {
          if (finished) return done
          try {
            const next = await reader.read()
            if (!next.done) return { done: false, value: next.value.value }
            release()
            return done
          } catch (error) {
            release()
            throw error
          }
        },
        async return() {
          if (!finished) await reader.cancel().catch(() => {}).finally(release)
          return done
        },
      }
    },
  }

  push(value: unknown, bytes: number): RemoteStreamFailure | undefined {
    if (this.ended) return invalidUplink
    if (this.controller === undefined) return
    if (bytes > (this.controller.desiredSize ?? 0)) return uplinkOverflow
    this.controller.enqueue({ value, bytes })
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    this.controller?.close()
  }

  cancel(): void {
    this.controller?.error(new Error('ENT_REMOTE_CLOSED'))
    this.controller = undefined
  }
}

type Active = {
  endpoint: string
  abort: AbortController
  uplink?: Uplink
  inputFailure?: RemoteStreamFailure
}

class MuxTransfer {
  readonly descriptor: MuxTransferDescriptor
  readonly path: string
  private readonly result = deferred<boolean>()
  readonly received = this.result.promise
  private state: 'pending' | 'reading' | 'read' | 'closed' = 'pending'
  private timer?: ReturnType<typeof setTimeout>
  private stopRead: (() => void) | undefined

  constructor(streamId: string, data: Buffer) {
    this.data = data
    this.descriptor = { type: 'owndsh-transfer', streamId, transferId: randomUUID(), bytes: data.byteLength }
    this.path = muxTransferPath(this.descriptor.transferId)
    this.refresh()
  }

  private data: Buffer | undefined

  open(signal?: AbortSignal): Response {
    if (this.state !== 'pending' || this.data === undefined || signal?.aborted) return new Response(null, { status: 404 })
    this.state = 'reading'
    this.refresh()
    let offset = 0
    const stop = () => this.finish(false)
    const bytes = this.data.byteLength
    const body = new ReadableStream<Uint8Array>({
      start: controller => {
        this.stopRead = () => {
          signal?.removeEventListener('abort', stop)
          controller.error(new Error('ENT_REMOTE_TRANSFER'))
        }
        signal?.addEventListener('abort', stop, { once: true })
      },
      pull: controller => {
        const data = this.data
        if (data === undefined) return
        const end = Math.min(offset + CARRIER_WINDOW_BYTES, data.byteLength)
        controller.enqueue(data.subarray(offset, end))
        offset = end
        this.refresh()
        if (offset === data.byteLength) {
          this.state = 'read'
          this.data = undefined
          signal?.removeEventListener('abort', stop)
          this.stopRead = undefined
          controller.close()
        }
      },
      cancel: () => {
        signal?.removeEventListener('abort', stop)
        this.stopRead = undefined
        this.finish(false)
      },
    }, { highWaterMark: 0 })
    return new Response(body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes) } })
  }

  acknowledge(ack: MuxTransferAck): void {
    if (ack.transferId !== this.descriptor.transferId || ack.streamId !== this.descriptor.streamId) return
    this.finish(ack.ok && this.state === 'read')
  }

  finish(received: boolean): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    clearTimeout(this.timer)
    this.data = undefined
    this.stopRead?.()
    this.stopRead = undefined
    this.result.resolve(received)
  }

  private refresh(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.finish(false), MUX_TRANSFER_TIMEOUT_MS)
    this.timer.unref()
  }
}

export class DshStreamMux implements RemoteDshMux {
  private readonly streams = new Map<string, Active>()
  private readonly output: Output[] = []
  private readonly denials = new Set<Promise<void>>()
  private pendingBytes = 0
  private transfer: MuxTransfer | undefined
  private wake: (() => void) | undefined
  private closed = false
  readonly messages = this.read()

  constructor(
    private readonly gateway: TypertGatewayWireStream,
    private readonly peer: Peer,
    private readonly catalog: WorkspaceCatalog,
    private readonly signal: AbortSignal,
    private readonly onClose: () => void,
    private readonly onLargeMessage?: Diagnostic,
  ) {
    signal.addEventListener('abort', this.close, { once: true })
    if (signal.aborted) this.close()
  }

  fetchTransfer(path: URL, init: DshFetchInit): Response {
    if (init.method !== 'GET' || path.search || init.body) throw new Error('ENT_REMOTE_DENIED')
    return this.transfer?.path === path.pathname ? this.transfer.open(init.signal) : new Response(null, { status: 404 })
  }

  async send(text: string): Promise<void> {
    this.signal.throwIfAborted()
    const bytes = Buffer.byteLength(text)
    if (this.closed || bytes > MAX_MUX_MESSAGE_BYTES) throw new Error('ENT_REMOTE_LIMIT')
    const control = muxTransferAckSchema.safeParse(JSON.parse(text))
    if (control.success) {
      this.transfer?.acknowledge(control.data)
      return
    }
    const frame = parseRemoteStreamClientMessage(text)
    if (Buffer.byteLength(frame.streamId) > MAX_STREAM_ID_BYTES) throw new Error('ENT_REMOTE_LIMIT')
    if (frame.type === 'open') {
      await this.open(frame)
      return
    }
    const active = this.streams.get(frame.streamId)
    if (active === undefined || active.abort.signal.aborted) return
    if (frame.type === 'cancel') this.stop(frame.streamId, active)
    if (frame.type === 'end') active.uplink?.end()
    if (frame.type === 'item') {
      const failure = active.uplink === undefined ? invalidUplink : active.uplink.push(frame.value, bytes)
      if (failure) {
        active.inputFailure = failure
        this.stop(frame.streamId, active)
      }
    }
  }

  readonly close = (): void => {
    if (this.closed) return
    this.closed = true
    this.signal.removeEventListener('abort', this.close)
    for (const [streamId, stream] of this.streams) this.stop(streamId, stream)
    this.streams.clear()
    for (const entry of this.output.splice(0)) {
      this.pendingBytes -= entry.bytes
      entry.settle(false)
    }
    this.wake?.()
    this.onClose()
  }

  private stop(streamId: string, active: Active): void {
    active.abort.abort()
    active.uplink?.cancel()
    if (this.transfer?.descriptor.streamId === streamId) this.transfer.finish(false)
  }

  private async open(frame: OpenFrame): Promise<void> {
    if (this.streams.has(frame.streamId)) throw new Error('ENT_REMOTE_DENIED')
    if (this.streams.size >= MAX_MUX_STREAMS || !DSH_STREAM_ENDPOINTS.has(frame.endpoint)) {
      while (!this.closed && this.denials.size >= MAX_MUX_STREAMS) await Promise.race(this.denials)
      const denial = this.fail(frame.streamId, denied, this.signal)
      this.denials.add(denial)
      void denial.then(() => this.denials.delete(denial))
      return
    }
    const active: Active = { endpoint: frame.endpoint, abort: new AbortController(),
      ...(frame.endpoint === 'terminal/attach' ? { uplink: new Uplink() } : {}) }
    this.streams.set(frame.streamId, active)
    void this.serve(frame, active).finally(() => {
      this.stop(frame.streamId, active)
      this.streams.delete(frame.streamId)
    }).catch(() => this.close())
  }

  private async serve(frame: OpenFrame, active: Active): Promise<void> {
    const { endpoint, payload, streamId } = frame
    const signal = active.abort.signal
    const inputWindow = active.uplink === undefined ? undefined : {
      maxBytes: MAX_UPLINK_BYTES,
      frameOverheadBytes: Buffer.byteLength(JSON.stringify({ type: 'item', streamId, value: null })) - 'null'.length,
    }
    if (endpoint === 'workspaceFiles/changes') {
      try { await authorizeFilePayload(this.catalog, payload) }
      catch { await this.fail(streamId, denied, signal); return }
    }
    let failure: RemoteStreamFailure | undefined
    try {
      signal.throwIfAborted()
      const uplink = active.uplink?.values ?? (async function* () {})()
      const source = await this.gateway.open(endpoint, payload, uplink, this.peer, signal)
      for await (const value of source) {
        const record = typeof value === 'object' && value !== null && 'type' in value ? value : undefined
        const kind = record?.type
        const item = inputWindow && record && kind === 'snapshot' ? { ...record, inputWindow } : value
        const text = JSON.stringify({ type: 'item', streamId, value: item })
        const bytes = Buffer.byteLength(text)
        if (signal.aborted) break
        if (bytes > MAX_MUX_MESSAGE_BYTES) {
          this.onLargeMessage?.(endpoint, kind === 'snapshot' || kind === 'event' ? kind : 'item', bytes)
        }
        const delivered = bytes > MAX_MUX_MESSAGE_BYTES
          ? await this.sendTransfer(streamId, active, text, bytes)
          : await this.write(text, bytes, signal)
        if (!delivered) {
          if (!signal.aborted) failure = limit
          active.uplink?.cancel()
          break
        }
      }
    } catch (error) {
      if (!signal.aborted && failure === undefined) failure = this.gateway.failure(error)
    }
    if (active.inputFailure) await this.fail(streamId, active.inputFailure, this.signal)
    else if (failure) await this.fail(streamId, failure, signal)
    else await this.write(JSON.stringify({ type: 'end', streamId }), 0, signal)
  }

  private async sendTransfer(streamId: string, active: Active, text: string, bytes: number): Promise<boolean> {
    if (bytes > MAX_MUX_TRANSFER_BYTES || this.transfer !== undefined) return false
    const transfer = new MuxTransfer(streamId, Buffer.from(text))
    this.transfer = transfer
    try {
      if (!await this.write(JSON.stringify(transfer.descriptor), 0, active.abort.signal)) return false
      return await transfer.received
    } finally {
      transfer.finish(false)
      this.transfer = undefined
    }
  }

  private async fail(streamId: string, error: RemoteStreamFailure, signal: AbortSignal): Promise<void> {
    let text: string
    try { text = JSON.stringify({ type: 'error', streamId, error }) }
    catch { text = JSON.stringify({ type: 'error', streamId, error: internal }) }
    if (Buffer.byteLength(text) > MAX_TERMINAL_FRAME_BYTES) text = JSON.stringify({ type: 'error', streamId, error: internal })
    await this.write(text, 0, signal)
  }

  private write(text: string, bytes: number, signal: AbortSignal): Promise<boolean> {
    if (this.closed || signal.aborted || this.pendingBytes + bytes > MAX_MUX_MESSAGE_BYTES) return Promise.resolve(false)
    // 每条活动订阅最多等一帧，准入错误另有数量上限。
    const result = deferred<boolean>()
    const entry: Output = { text, bytes, signal, settle: result.resolve }
    const cancel = () => {
      const index = this.output.indexOf(entry)
      if (index === -1) return
      this.output.splice(index, 1)
      this.pendingBytes -= bytes
      entry.settle(false)
    }
    this.pendingBytes += bytes
    this.output.push(entry)
    signal.addEventListener('abort', cancel, { once: true })
    this.wake?.()
    return result.promise.finally(() => signal.removeEventListener('abort', cancel))
  }

  private async *read(): AsyncGenerator<string> {
    try {
      while (!this.closed) {
        const next = this.output.shift()
        if (next === undefined) {
          await new Promise<void>(resolve => { this.wake = resolve })
          this.wake = undefined
          continue
        }
        try {
          if (!next.signal.aborted) yield next.text
        } finally {
          this.pendingBytes -= next.bytes
          next.settle(!this.closed && !next.signal.aborted)
        }
      }
    } finally {
      this.close()
    }
  }
}
