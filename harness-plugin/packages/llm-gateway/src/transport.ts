/**
 * [INPUT]: 依赖 Fetch Response、ReadableStream、TextDecoder 与 AbortSignal 标准 Web API
 * [OUTPUT]: 对外提供严格 `[DONE]` 终止的 OpenAI SSE frame 流及含平台 code/requestId 的传输错误
 * [POS]: llm-gateway 的字节传输层，负责 framing、错误帧和 reader 停稳，不解释模型内容
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** SSE/HTTP 边界的稳定失败，不携带任意响应正文。 */
export class OpenAiSseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'OpenAiSseError'
  }
}

export type OpenAiSseFrame = Record<string, unknown>

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

async function responseFailure(response: Response): Promise<OpenAiSseError> {
  let code = response.status === 401 ? 'ENT_AUTH_REQUIRED' : 'ENT_PLATFORM_UNAVAILABLE'
  let requestId = safeRequestId(response.headers.get('x-request-id'))
  try {
    const value = await response.json() as { error?: { code?: unknown; requestId?: unknown } }
    if (typeof value.error?.code === 'string' && value.error.code.length > 0) code = value.error.code
    requestId = safeRequestId(value.error?.requestId) ?? requestId
  } catch {
    // HTTP status remains a complete, bounded failure when JSON is malformed.
  }
  return new OpenAiSseError(code, `enterprise model request failed with HTTP ${response.status}`, response.status, requestId)
}

function dataOf(frame: string): string | undefined {
  const data = frame
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
  return data.length === 0 ? undefined : data.join('\n')
}

function decodeFrame(data: string, responseRequestId?: string): OpenAiSseFrame {
  let frame: unknown
  try {
    frame = JSON.parse(data)
  } catch {
    throw new OpenAiSseError(
      'ENT_UPSTREAM_INVALID_RESPONSE',
      'enterprise gateway sent malformed SSE JSON',
      undefined,
      responseRequestId,
    )
  }
  if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) {
    throw new OpenAiSseError(
      'ENT_UPSTREAM_INVALID_RESPONSE',
      'enterprise gateway sent a non-object SSE frame',
      undefined,
      responseRequestId,
    )
  }
  const record = frame as Record<string, unknown>
  const error = record['error']
  if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
    const value = error as Record<string, unknown>
    throw new OpenAiSseError(
      typeof value['code'] === 'string' && value['code'].length > 0
        ? value['code']
        : 'ENT_UPSTREAM_INVALID_RESPONSE',
      'enterprise model stream failed',
      undefined,
      safeRequestId(value['request_id']) ?? responseRequestId,
    )
  }
  return record
}

/** 解码成功的 OpenAI-compatible SSE，并在任意退出路径等待 reader 取消完成。 */
export async function* openAiSseFrames(
  response: Response,
  signal: AbortSignal = new AbortController().signal,
): AsyncGenerator<OpenAiSseFrame, void, void> {
  if (!response.ok) throw await responseFailure(response)
  const responseRequestId = safeRequestId(response.headers.get('x-request-id'))
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
    throw new OpenAiSseError(
      'ENT_UPSTREAM_INVALID_RESPONSE',
      'enterprise gateway response is not text/event-stream',
      response.status,
      responseRequestId,
    )
  }
  if (response.body === null) {
    throw new OpenAiSseError(
      'ENT_UPSTREAM_INVALID_RESPONSE',
      'enterprise gateway SSE response has no body',
      response.status,
      responseRequestId,
    )
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
      buffer += decoder.decode(part.value, { stream: !part.done }).replaceAll('\r\n', '\n')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const data = dataOf(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        if (data === undefined) continue
        if (data === '[DONE]') {
          completed = true
          return
        }
        yield decodeFrame(data, responseRequestId)
      }
      if (part.done) break
    }
    throw new OpenAiSseError(
      'ENT_UPSTREAM_INVALID_RESPONSE',
      'enterprise gateway SSE disconnected before [DONE]',
      undefined,
      responseRequestId,
    )
  } finally {
    signal.removeEventListener('abort', cancel)
    if (!completed) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
