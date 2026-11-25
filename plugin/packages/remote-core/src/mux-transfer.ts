/**
 * [INPUT]: 依赖原生 mux 文本、同 link 的 HTTP 字节流和取消信号。
 * [OUTPUT]: 定义大消息描述、确认与读取路径，接收端还原原生消息并按订阅确认。
 * [POS]: remote-core 的 mux 接收边界；独立读取大消息，其他订阅继续交付。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod'
import { MAX_MUX_MESSAGE_BYTES, MAX_MUX_STREAMS } from './carrier.js'
import type { RemoteDshMux } from './carrier-types.js'

export const MAX_MUX_TRANSFER_BYTES = 16 * 1024 * 1024
export const MUX_TRANSFER_TIMEOUT_MS = 30_000
export const MUX_TRANSFER_PATH_PREFIX = '/api/owndsh.remote-transfer/'

const streamId = z.string().min(1)
const transferIdentity = { streamId, transferId: z.uuid() }
export const muxTransferDescriptorSchema = z.strictObject({
  type: z.literal('owndsh-transfer'),
  ...transferIdentity,
  bytes: z.number().int().gt(MAX_MUX_MESSAGE_BYTES).max(MAX_MUX_TRANSFER_BYTES),
})
export const muxTransferAckSchema = z.strictObject({
  type: z.literal('owndsh-transfer-ack'),
  ...transferIdentity,
  ok: z.boolean(),
})
export type MuxTransferDescriptor = z.infer<typeof muxTransferDescriptorSchema>
export type MuxTransferAck = z.infer<typeof muxTransferAckSchema>

export function muxTransferPath(transferId: string): string {
  return MUX_TRANSFER_PATH_PREFIX + transferId
}

const frameHeader = z.object({ type: z.string(), streamId })
const nativeItem = z.strictObject({ type: z.literal('item'), streamId, value: z.unknown().optional() })
type FetchTransfer = (path: string, signal: AbortSignal) => Promise<Response>
type NativeRead = { kind: 'message'; next: IteratorResult<string> } | { kind: 'failure'; error: unknown }
type TransferResult = { kind: 'item'; text: string } | { kind: 'failure' }
interface Transfer {
  readonly description: MuxTransferDescriptor
  readonly abort: AbortController
  result?: TransferResult
}

export function receiveMuxTransfers(mux: RemoteDshMux, signal: AbortSignal, fetch: FetchTransfer): RemoteDshMux {
  const openStreams = new Set<string>()
  let transfer: Transfer | undefined
  let wake: (() => void) | undefined

  function cancel(stream: string): void {
    openStreams.delete(stream)
    if (transfer?.description.streamId !== stream) return
    transfer.abort.abort()
    transfer = undefined
  }

  const ack = ({ streamId, transferId }: MuxTransferDescriptor, ok: boolean) => mux.send(JSON.stringify({
    type: 'owndsh-transfer-ack', streamId, transferId, ok,
  } satisfies MuxTransferAck))

  async function* messages(): AsyncGenerator<string> {
    const reader = mux.messages[Symbol.asyncIterator]()
    const native: { pending?: NativeRead } = {}
    const notify = () => wake?.()
    function readNext(): void {
      void Promise.resolve(reader.next()).then(
        next => { native.pending = { kind: 'message', next }; notify() },
        error => { native.pending = { kind: 'failure', error }; notify() },
      )
    }

    signal.addEventListener('abort', notify, { once: true })
    try {
      readNext()
      while (!signal.aborted) {
        const input = native.pending
        if (input !== undefined) {
          delete native.pending
          if (input.kind === 'failure') throw input.error
          if (input.next.done) return
          const text = input.next.value
          const frame = parseJson(text)
          const header = frameHeader.safeParse(frame)
          switch (header.data?.type) {
            case 'owndsh-transfer': {
              const description = muxTransferDescriptorSchema.parse(frame)
              if (!openStreams.has(description.streamId) || transfer !== undefined) {
                await ack(description, false)
                break
              }
              const started: Transfer = { description, abort: new AbortController() }
              transfer = started
              const readSignal = AbortSignal.any([started.abort.signal, signal])
              void readTransfer(description, readSignal, fetch).then(
                text => { started.result = { kind: 'item', text }; notify() },
                () => { started.result = { kind: 'failure' }; notify() },
              )
              break
            }
            case 'end':
            case 'error':
              cancel(header.data.streamId)
              yield text
              break
            default:
              yield text
          }
          readNext()
        }

        const finished = transfer
        if (finished?.result !== undefined) {
          if (finished.result.kind === 'item') yield finished.result.text
          if (transfer === finished && !signal.aborted) {
            transfer = undefined
            await ack(finished.description, finished.result.kind === 'item')
          }
        }
        if (!signal.aborted && native.pending === undefined && transfer?.result === undefined) {
          await new Promise<void>(resolve => { wake = resolve })
          wake = undefined
        }
      }
    } finally {
      signal.removeEventListener('abort', notify)
      transfer?.abort.abort()
      transfer = undefined
      openStreams.clear()
      await mux.close()
      await reader.return?.()
    }
  }

  return {
    send: async text => {
      const header = frameHeader.safeParse(parseJson(text)).data
      if (header?.type === 'owndsh-transfer' || header?.type === 'owndsh-transfer-ack') throw new Error('ENT_REMOTE_PROTOCOL')
      if (header?.type === 'cancel') cancel(header.streamId)
      if (header?.type !== 'open' || openStreams.has(header.streamId) || openStreams.size >= MAX_MUX_STREAMS) {
        return mux.send(text)
      }
      openStreams.add(header.streamId)
      try {
        await mux.send(text)
      } catch (error) {
        cancel(header.streamId)
        throw error
      }
    },
    messages: messages(),
    close: code => mux.close(code),
  }
}

async function readTransfer(description: MuxTransferDescriptor, lifetime: AbortSignal, fetch: FetchTransfer): Promise<string> {
  const idle = new AbortController()
  const signal = AbortSignal.any([lifetime, idle.signal])
  let timer: ReturnType<typeof setTimeout> | undefined
  function resetTimeout(): void {
    clearTimeout(timer)
    timer = setTimeout(() => idle.abort(new Error('ENT_REMOTE_TRANSFER_TIMEOUT')), MUX_TRANSFER_TIMEOUT_MS)
  }
  resetTimeout()
  try {
    const response = await fetch(muxTransferPath(description.transferId), signal)
    if (!response.ok || response.body === null) {
      await response.body?.cancel()
      throw new Error('ENT_REMOTE_PROTOCOL')
    }
    const reader = response.body.getReader()
    try {
      const bytes = new Uint8Array(description.bytes)
      let written = 0
      while (true) {
        const part = await reader.read()
        signal.throwIfAborted()
        if (part.done) break
        if (written + part.value.length > bytes.length) throw new Error('ENT_REMOTE_LIMIT')
        bytes.set(part.value, written)
        written += part.value.length
        if (part.value.length > 0) resetTimeout()
      }
      if (written !== description.bytes) throw new Error('ENT_REMOTE_TRUNCATED')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const frame = nativeItem.parse(parseJson(text))
      if (frame.streamId !== description.streamId) throw new Error('ENT_REMOTE_PROTOCOL')
      return text
    } catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    } finally {
      reader.releaseLock()
    }
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return undefined }
}
