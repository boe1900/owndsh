/**
 * [INPUT]: 对齐中心 `/enterprise/gateway/v1/chat/completions` 的严格 OpenAI-compatible JSON/SSE 契约
 * [OUTPUT]: 提供请求 message/tool、增量 choice、usage 与流内错误的内部 wire 类型
 * [POS]: llm-gateway 的传输词汇层，只描述中心公开协议，不容纳 provider route 或 credential
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  thinking?: { type: 'enabled' | 'disabled' }
  reasoning_effort?: 'high' | 'max'
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  stop?: string[]
}

export type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'tool'; content: string; tool_call_id: string }
  | {
    role: 'assistant'
    content: string
    reasoning_content?: string
    tool_calls?: WireToolCall[]
  }

export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface WireChunk {
  choices?: WireChoice[]
  usage?: WireUsage | null
}

export interface WireChoice {
  delta?: {
    content?: string | null
    reasoning_content?: string | null
    tool_calls?: WireToolCallDelta[]
  }
  finish_reason?: string | null
}

export interface WireToolCallDelta {
  index: number
  id?: string
  function?: { name?: string; arguments?: string }
}

export interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  prompt_cache_hit_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}
