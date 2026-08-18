/**
 * [INPUT]: 依赖 Fetch Response、ReadableStream、TextDecoder 与 AbortSignal 的标准 Web API
 * [OUTPUT]: 对外提供 openAiSseFrames 异步流、OpenAiSseError 和结构化 JSON frame
 * [POS]: llm-gateway 的传输解码层，隔离 OpenAI SSE framing 与后续 Harness StreamChunk 映射
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** Stable transport failure raised before Harness-specific chunk mapping. */
export class OpenAiSseError extends Error {
  constructor(
    readonly code: 'ENT_UPSTREAM_INVALID_RESPONSE' | 'ENT_UPSTREAM_UNAVAILABLE',
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'OpenAiSseError'
  }
}

export type OpenAiSseFrame = Record<string, unknown>

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

async function upstreamFailure(response: Response): Promise<OpenAiSseError> {
  const text = (await response.text()).slice(0, 4096)
  let message = `upstream returned HTTP ${response.status}`
  try {
    const body = JSON.parse(text) as { error?: { message?: unknown } }
    if (typeof body.error?.message === 'string') message = body.error.message
  } catch {
    // The bounded status message is safer than exposing an arbitrary upstream body.
  }
  return new OpenAiSseError('ENT_UPSTREAM_UNAVAILABLE', message, response.status)
}

function dataOf(frame: string): string | undefined {
  const data = frame
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
  return data.length === 0 ? undefined : data.join('\n')
}

function decodeFrame(data: string): OpenAiSseFrame {
  try {
    const frame = JSON.parse(data) as unknown
    if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) throw new TypeError()
    const record = frame as Record<string, unknown>
    if (record['error'] !== undefined) {
      throw new OpenAiSseError('ENT_UPSTREAM_INVALID_RESPONSE', 'upstream sent an SSE error frame')
    }
    return record
  } catch (error) {
    if (error instanceof OpenAiSseError) throw error
    throw new OpenAiSseError('ENT_UPSTREAM_INVALID_RESPONSE', 'upstream sent malformed SSE JSON')
  }
}

/** Decode one successful OpenAI-compatible stream and require its `[DONE]` terminator. */
export async function* openAiSseFrames(
  response: Response,
  signal: AbortSignal = new AbortController().signal,
): AsyncGenerator<OpenAiSseFrame, void, void> {
  if (!response.ok) throw await upstreamFailure(response)
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
    throw new OpenAiSseError('ENT_UPSTREAM_INVALID_RESPONSE', 'upstream response is not text/event-stream')
  }
  if (response.body === null) {
    throw new OpenAiSseError('ENT_UPSTREAM_INVALID_RESPONSE', 'upstream SSE response has no body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  const cancel = (): void => { void reader.cancel(abortReason(signal)) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      if (signal.aborted) throw abortReason(signal)
      const part = await reader.read()
      if (signal.aborted) throw abortReason(signal)
      buffer += decoder.decode(part.value, { stream: !part.done })
      buffer = buffer.replaceAll('\r\n', '\n')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = dataOf(raw)
        if (data === undefined) continue
        if (data === '[DONE]') {
          completed = true
          return
        }
        yield decodeFrame(data)
      }
      if (part.done) break
    }

    const trailing = dataOf(buffer.trim())
    if (trailing !== undefined && trailing !== '[DONE]') yield decodeFrame(trailing)
    if (trailing === '[DONE]') completed = true
    if (!completed) {
      throw new OpenAiSseError('ENT_UPSTREAM_INVALID_RESPONSE', 'upstream SSE disconnected before [DONE]')
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    if (!completed) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
