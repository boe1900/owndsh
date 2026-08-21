/**
 * [INPUT]: 依赖官方 dsh-llm 消息/adapter 契约、Enterprise adapter 与可控内存平台 port
 * [OUTPUT]: 验证动态目录/default、SSE/JSON 请求协商、header/body、reasoning/tool/usage、错误矩阵及两类取消停稳
 * [POS]: llm-gateway T11 核心单测，使用真实官方类型而不以 ambient shim 模拟 Harness
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  CallId,
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  ReasoningEffortId,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import {
  EnterprisePlatformError,
  type BootstrapSnapshot,
  type EnterprisePlatformStatus,
} from '@enterprise-agent/dsh-platform-client'
import { describe, expect, it, vi } from 'vitest'
import {
  ENTERPRISE_DEFAULT_MODEL,
  ENTERPRISE_GATEWAY_PATH,
  EnterpriseGatewayAdapter,
  type EnterprisePlatformPort,
} from '../src/index.js'

const REQUEST_ID = `req_${'1'.repeat(26)}`
const MODEL: BootstrapSnapshot['models'][number] = {
  alias: 'deepseek-reasoner',
  displayName: 'Enterprise Reasoner',
  contextWindow: 65_536,
  maxOutputTokens: 8_192,
  reasoning: true,
  isDefault: true,
}

function bootstrap(models: BootstrapSnapshot['models'] = [MODEL]): BootstrapSnapshot {
  return {
    revision: 1,
    user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
    device: { id: '90018', installationId: '123e4567-e89b-42d3-a456-426614174010', status: 'ACTIVE' },
    models,
    quotas: [],
    plugins: { revision: 1, assignments: [] },
    sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
  }
}

function status(state: EnterprisePlatformStatus['state'] = 'READY'): EnterprisePlatformStatus {
  return {
    state,
    bundleVersion: '0.1.0',
    platformUrl: 'https://enterprise.example.com',
    transport: 'webServer.register',
  }
}

class FakePlatform implements EnterprisePlatformPort {
  snapshot: BootstrapSnapshot | undefined = bootstrap()
  currentStatus = status()
  response: () => Promise<Response> = async () => sseResponse([
    { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 2, completion_tokens: 1 } },
  ])
  readonly requests: Array<{ input: string; init: RequestInit }> = []
  readonly listeners = new Set<(status: EnterprisePlatformStatus) => void>()

  status(): EnterprisePlatformStatus { return structuredClone(this.currentStatus) }
  bootstrap(): BootstrapSnapshot | undefined {
    return this.snapshot === undefined ? undefined : structuredClone(this.snapshot)
  }
  async request(input: string | URL, init: RequestInit = {}): Promise<Response> {
    this.requests.push({ input: String(input), init })
    return this.response()
  }
  subscribe(listener: (value: EnterprisePlatformStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

function sseResponse(frames: readonly unknown[], headers: Record<string, string> = {}): Response {
  const wire = `${frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('')}data: [DONE]\n\n`
  return new Response(wire, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'x-request-id': REQUEST_ID, ...headers },
  })
}

function options(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'enterprise',
    model: ENTERPRISE_DEFAULT_MODEL,
    messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'hello' }] })],
    ...overrides,
  }
}

async function collect(iterable: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const result: StreamChunk[] = []
  for await (const chunk of iterable) result.push(chunk)
  return result
}

describe('EnterpriseGatewayAdapter', () => {
  it('publishes the dynamic catalog, resolves default metadata and disables automatic retries', async () => {
    const platform = new FakePlatform()
    const adapter = new EnterpriseGatewayAdapter({ platform, harnessVersion: '0.1.0-rc.7', bundleVersion: '0.1.0' })
    await expect(adapter.listModels('enterprise')).resolves.toEqual([{
      provider: 'enterprise', id: MODEL.alias, name: MODEL.displayName, inputModalities: ['text'],
    }])
    await expect(adapter.resolveModel('enterprise', ENTERPRISE_DEFAULT_MODEL)).resolves.toMatchObject({
      provider: 'enterprise',
      id: ENTERPRISE_DEFAULT_MODEL,
      context: { contextWindow: 65_536 },
      defaultMaxTokens: 8_192,
      reasoning: { defaultEffort: 'high', efforts: [{ id: 'off' }, { id: 'high' }, { id: 'max' }] },
    })
    expect(adapter.providerRetryPolicy('enterprise')).toMatchObject({ mode: 'normal', maxRetries: 0 })
    await expect(adapter.resolveModel('enterprise', 'not-assigned')).rejects.toMatchObject({
      code: 'ENT_MODEL_NOT_ASSIGNED',
    })
    platform.snapshot = undefined
    platform.currentStatus = status('SIGNED_OUT')
    await expect(adapter.resolveModel('enterprise', ENTERPRISE_DEFAULT_MODEL)).rejects.toMatchObject({
      code: 'ENT_AUTH_REQUIRED',
    })
  })

  it('maps official messages and a complete reasoning/tool/usage stream through the center request', async () => {
    const platform = new FakePlatform()
    platform.response = async () => sseResponse([
      { choices: [{ delta: { reasoning_content: 'think' } }] },
      { choices: [{ delta: { content: 'answer' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-2', function: { name: 'lookup', arguments: '{' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' }] },
      {
        choices: [],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 7,
          prompt_tokens_details: { cached_tokens: 3 },
          completion_tokens_details: { reasoning_tokens: 2 },
        },
      },
    ])
    const adapter = new EnterpriseGatewayAdapter({
      platform,
      harnessVersion: '0.1.0-rc.7',
      bundleVersion: '0.1.0',
      createIdempotencyKey: () => '123e4567-e89b-42d3-a456-426614174000',
    })
    const priorCall = CallId('call-1')
    const chunks = await collect(adapter.stream(options({
      system: 'system',
      reasoningEffort: ReasoningEffortId('max'),
      messages: [
        createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'hello' }] }),
        createAssistantMessage({
          source: { provider: 'enterprise', model: MODEL.alias },
          content: [
            { type: 'reasoning', text: 'prior thought' },
            { type: 'tool-call', id: priorCall, name: 'search', arguments: '{"q":"x"}' },
          ],
        }),
        createToolResultMessage({ callId: priorCall, content: [{ type: 'text', text: 'found' }], isError: false }),
      ],
      tools: [{ name: 'lookup', description: 'lookup data', parameters: { type: 'object' } }],
      maxTokens: 512,
      temperature: 0.2,
      stop: ['END'],
    })))

    expect(platform.requests).toHaveLength(1)
    const request = platform.requests[0]
    expect(request?.input).toBe(ENTERPRISE_GATEWAY_PATH)
    const headers = new Headers(request?.init.headers)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('accept')).toBe('text/event-stream, application/json')
    expect(headers.get('user-agent')).toContain('deepseek-harness/0.1.0-rc.7')
    expect(headers.get('idempotency-key')).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(headers.get('x-harness-version')).toBe('0.1.0-rc.7')
    expect(headers.get('x-enterprise-bundle-version')).toBe('0.1.0')
    const body = JSON.parse(String(request?.init.body)) as Record<string, any>
    expect(body).toMatchObject({
      model: ENTERPRISE_DEFAULT_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
      max_tokens: 512,
    })
    expect(body).not.toHaveProperty('provider')
    expect(body).not.toHaveProperty('base_url')
    expect(body).not.toHaveProperty('credential')
    expect(body.messages).toContainEqual({
      role: 'assistant',
      content: '',
      reasoning_content: 'prior thought',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } }],
    })
    expect(body.messages).toContainEqual({ role: 'tool', tool_call_id: 'call-1', content: 'found' })
    expect(chunks).toContainEqual({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'think' } })
    expect(chunks).toContainEqual({ type: 'block-end', index: 1, block: { type: 'text', text: 'answer' } })
    expect(chunks).toContainEqual({
      type: 'block-end', index: 2,
      block: { type: 'tool-call', id: 'call-2', name: 'lookup', arguments: '{}' },
    })
    expect(chunks).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 9, outputTokens: 7, cacheReadTokens: 3, reasoningTokens: 2 },
    })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it.each([
    ['ENT_AUTH_REQUIRED', 401],
    ['ENT_MODEL_NOT_ASSIGNED', 403],
    ['ENT_QUOTA_DAILY_EXCEEDED', 429],
    ['ENT_DEVICE_REVOKED', 403],
  ])('preserves platform failure %s as LlmError facts', async (code, httpStatus) => {
    const platform = new FakePlatform()
    platform.response = async () => {
      throw new EnterprisePlatformError(code as any, 'private platform detail', false, httpStatus, REQUEST_ID)
    }
    const adapter = new EnterpriseGatewayAdapter({ platform, harnessVersion: '0.1.0-rc.7', bundleVersion: '0.1.0' })
    await expect(collect(adapter.stream(options()))).rejects.toMatchObject({
      code,
      failure: { code, status: httpStatus, requestId: REQUEST_ID },
    })
  })

  it('preserves a sanitized in-stream enterprise error frame', async () => {
    const platform = new FakePlatform()
    platform.response = async () => new Response(
      `data: {"error":{"code":"ENT_UPSTREAM_TIMEOUT","message":"private","type":"enterprise_gateway_error","request_id":"${REQUEST_ID}"}}\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    )
    const adapter = new EnterpriseGatewayAdapter({ platform, harnessVersion: '0.1.0-rc.7', bundleVersion: '0.1.0' })
    await expect(collect(adapter.stream(options()))).rejects.toMatchObject({
      code: 'ENT_UPSTREAM_TIMEOUT',
      message: 'enterprise model stream failed',
      failure: { requestId: REQUEST_ID },
    })
  })

  it('aborts and settles the reader before caller cancellation rejects', async () => {
    const platform = new FakePlatform()
    let cancelled = false
    platform.response = async () => new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true },
    }), { headers: { 'content-type': 'text/event-stream' } })
    const abort = new AbortController()
    const adapter = new EnterpriseGatewayAdapter({ platform, harnessVersion: '0.1.0-rc.7', bundleVersion: '0.1.0' })
    const pending = collect(adapter.stream(options({ signal: abort.signal })))
    await vi.waitFor(() => { expect(platform.requests).toHaveLength(1) })
    abort.abort(new DOMException('cancelled', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
    expect(cancelled).toBe(true)
  })

  it('cancels and settles the reader when the consumer stops early', async () => {
    const platform = new FakePlatform()
    const encoder = new TextEncoder()
    let cancelled = false
    platform.response = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'))
      },
      cancel() { cancelled = true },
    }), { headers: { 'content-type': 'text/event-stream' } })
    const adapter = new EnterpriseGatewayAdapter({ platform, harnessVersion: '0.1.0-rc.7', bundleVersion: '0.1.0' })
    const iterator = adapter.stream(options())[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'block-start' } })
    await iterator.return?.()
    expect(cancelled).toBe(true)
  })
})
