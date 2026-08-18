/**
 * [INPUT]: 依赖已完成 SSE framing 的 OpenAI chunk 流与 Harness CallId/StreamChunk/TokenUsage 契约
 * [OUTPUT]: 对外提供 reasoning、text、并行 tool calls、usage 与 finish 的有序 StreamChunk 翻译
 * [POS]: llm-gateway 的响应语义层，维护 block 生命周期并保证 finish 后不再产生 chunk
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { OpenAiSseFrame } from './transport.js'
import type { WireChunk, WireUsage } from './wire.js'

interface OpenBlock {
  readonly index: number
  readonly kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  callId?: string
  name?: string
}

export function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case 'stop': return { kind: 'stop' }
    case 'tool_calls': return { kind: 'tool-calls' }
    case 'length': return { kind: 'max-tokens' }
    default: return {
      kind: 'error',
      failure: { message: `enterprise model stopped: ${reason}`, code: reason.toUpperCase() },
    }
  }
}

function token(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new LlmError(`enterprise gateway returned invalid ${field}`, 'ENT_UPSTREAM_INVALID_RESPONSE')
  }
  return Number(value)
}

export function mapUsage(usage: WireUsage): TokenUsage {
  const prompt = token(usage.prompt_tokens, 'prompt_tokens')
  const output = token(usage.completion_tokens, 'completion_tokens')
  const rawCache = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens
  const cacheRead = rawCache === undefined ? undefined : token(rawCache, 'cached_tokens')
  if ((cacheRead ?? 0) > prompt) {
    throw new LlmError('enterprise gateway returned cache usage greater than prompt usage', 'ENT_UPSTREAM_INVALID_RESPONSE')
  }
  const rawReasoning = usage.completion_tokens_details?.reasoning_tokens
  const reasoning = rawReasoning === undefined ? undefined : token(rawReasoning, 'reasoning_tokens')
  return {
    inputTokens: prompt - (cacheRead ?? 0),
    outputTokens: output,
    ...cacheRead === undefined ? {} : { cacheReadTokens: cacheRead },
    ...reasoning === undefined ? {} : { reasoningTokens: reasoning },
  }
}

function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: CallId(block.callId ?? ''),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}

/** 将完整且 `[DONE]` 终止的 frame 流翻译为 Harness block 协议。 */
export async function* translateFrames(frames: AsyncIterable<OpenAiSseFrame>): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  let textBlock: OpenBlock | undefined
  let reasoningBlock: OpenBlock | undefined
  const toolBlocks = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let pendingFinish: FinishReason | undefined
  let pendingUsage: TokenUsage | undefined

  const open = (kind: OpenBlock['kind']): OpenBlock => {
    const block: OpenBlock = { index: nextIndex++, kind, text: '' }
    order.push(block)
    return block
  }

  for await (const raw of frames) {
    const chunk = raw as WireChunk
    if (chunk.choices !== undefined && !Array.isArray(chunk.choices)) {
      throw new LlmError('enterprise gateway returned invalid choices', 'ENT_UPSTREAM_INVALID_RESPONSE')
    }
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta
      const reasoning = delta?.reasoning_content
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        if (reasoningBlock === undefined) {
          reasoningBlock = open('reasoning')
          yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' }
        }
        reasoningBlock.text += reasoning
        yield { type: 'reasoning-delta', index: reasoningBlock.index, text: reasoning }
      }
      const content = delta?.content
      if (typeof content === 'string' && content.length > 0) {
        if (textBlock === undefined) {
          textBlock = open('text')
          yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
        }
        textBlock.text += content
        yield { type: 'text-delta', index: textBlock.index, text: content }
      }
      for (const call of delta?.tool_calls ?? []) {
        if (!Number.isSafeInteger(call.index) || call.index < 0) {
          throw new LlmError('enterprise gateway returned invalid tool call index', 'ENT_UPSTREAM_INVALID_RESPONSE')
        }
        let block = toolBlocks.get(call.index)
        if (block === undefined) {
          block = open('tool-call')
          toolBlocks.set(call.index, block)
          yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
        }
        if (call.id !== undefined) block.callId = call.id
        if (call.function?.name !== undefined) block.name = call.function.name
        const fragment = call.function?.arguments ?? ''
        block.text += fragment
        yield {
          type: 'tool-call-delta',
          index: block.index,
          id: CallId(block.callId ?? ''),
          ...block.name === undefined ? {} : { name: block.name },
          argumentsDelta: fragment,
        }
      }
      if (typeof choice.finish_reason === 'string') pendingFinish = mapFinishReason(choice.finish_reason)
    }
    if (chunk.usage !== undefined && chunk.usage !== null) pendingUsage = mapUsage(chunk.usage)
  }

  for (const block of order) yield { type: 'block-end', index: block.index, block: closeBlock(block) }
  if (pendingUsage !== undefined) yield { type: 'usage', usage: pendingUsage }
  const reason = pendingFinish ?? { kind: 'stop' as const }
  yield {
    type: 'finish',
    reason: reason.kind === 'stop' && order.length === 0
      ? {
        kind: 'error',
        failure: { message: 'enterprise model completed without content', code: EMPTY_RESPONSE_CODE },
      }
      : reason,
  }
}
