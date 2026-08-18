/**
 * [INPUT]: 依赖 llm-gateway SSE 解码器与标准 Response/ReadableStream 测试对象
 * [OUTPUT]: 验证分块、多 data、非 2xx、error frame、断流和取消语义
 * [POS]: llm-gateway 传输回归测试，锁定后续 LlmAdapter 不得吞错或自动补全断流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest'
import { openAiSseFrames, OpenAiSseError } from '../src/index.js'

function streamResponse(chunks: string[], close = true): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      if (close) controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

async function collect(response: Response, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const frames: Record<string, unknown>[] = []
  for await (const frame of openAiSseFrames(response, signal)) frames.push(frame)
  return frames
}

describe('OpenAI-compatible SSE', () => {
  it('decodes frames split across chunks and stops at DONE', async () => {
    const response = streamResponse([
      'data: {"id":"chat-1",',
      '"choices":[]}\r\n\r\n',
      ': keepalive\n\n',
      'data: [DONE]\n\n',
    ])
    await expect(collect(response)).resolves.toEqual([{ id: 'chat-1', choices: [] }])
  })

  it('maps a bounded non-2xx JSON error', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
      headers: { 'content-type': 'application/json' },
      status: 429,
    })
    await expect(collect(response)).rejects.toMatchObject({
      code: 'ENT_UPSTREAM_UNAVAILABLE',
      message: 'quota exceeded',
      status: 429,
    })
  })

  it('rejects an in-stream error and a disconnect without DONE', async () => {
    await expect(collect(streamResponse([
      'data: {"error":{"message":"broken"}}\n\n',
    ]))).rejects.toBeInstanceOf(OpenAiSseError)
    await expect(collect(streamResponse([
      'data: {"id":"partial"}\n\n',
    ]))).rejects.toMatchObject({
      code: 'ENT_UPSTREAM_INVALID_RESPONSE',
      message: 'upstream SSE disconnected before [DONE]',
    })
  })

  it('cancels the reader when the caller aborts', async () => {
    const controller = new AbortController()
    let cancelled = false
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true },
    }), { headers: { 'content-type': 'text/event-stream' } })
    const pending = collect(response, controller.signal)
    controller.abort(new DOMException('cancelled', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelled).toBe(true)
  })
})
