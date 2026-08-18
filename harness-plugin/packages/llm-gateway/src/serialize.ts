/**
 * [INPUT]: 依赖 Harness GenerateOptions/ContentBlock 与中心严格 OpenAI-compatible request 词汇
 * [OUTPUT]: 对外提供纯文本消息、tool replay、reasoning effort 与 sampling 字段的请求序列化
 * [POS]: llm-gateway 的请求适配层，显式拒绝多模态且不接触 URL、Token 或 provider credential
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { WireMessage, WireRequest, WireTool } from './wire.js'

function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks.filter(block => block.type === 'text').map(block => block.text).join('')
}

function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('enterprise managed models do not support image content', 'UNSUPPORTED_CONTENT')
  }
}

function assistantMessage(message: Message): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: String(block.id),
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))
  return {
    role: 'assistant',
    content: text,
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/** 将 Harness 历史展开为按原顺序排列的 OpenAI message。 */
export function serializeMessages(messages: readonly Message[]): WireMessage[] {
  const result: WireMessage[] = []
  for (const message of messages) {
    assertTextOnly(message.content)
    if (message.role === 'system') {
      result.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      result.push(assistantMessage(message))
      continue
    }
    const text = flattenText(message.content)
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    if (text.length > 0 || toolResults.length === 0) result.push({ role: 'user', content: text })
    for (const toolResult of toolResults) {
      assertTextOnly(toolResult.content)
      result.push({
        role: 'tool',
        tool_call_id: String(toolResult.toolCallId),
        content: flattenText(toolResult.content) || '(no output)',
      })
    }
  }
  return result
}

function reasoning(options: GenerateOptions): Pick<WireRequest, 'thinking' | 'reasoning_effort'> {
  if (options.purpose === 'session-title') return { thinking: { type: 'disabled' } }
  const effort = options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort)
  if (effort === undefined) return {}
  if (effort === 'off') return { thinking: { type: 'disabled' } }
  if (effort === 'high' || effort === 'max') {
    return { thinking: { type: 'enabled' }, reasoning_effort: effort }
  }
  throw new LlmError(
    `enterprise managed models do not support reasoning effort "${effort}"`,
    'UNSUPPORTED_REASONING_EFFORT',
  )
}

/** 构造中心网关唯一接受的流式 request，不携带任何上游 route 或 credential。 */
export function serializeRequest(options: GenerateOptions): WireRequest {
  const messages: WireMessage[] = []
  if (options.system !== undefined) messages.push({ role: 'system', content: options.system })
  messages.push(...serializeMessages(options.messages))
  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...reasoning(options),
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop === undefined ? {} : { stop: options.stop },
  }
}
