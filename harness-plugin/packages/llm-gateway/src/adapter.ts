/**
 * [INPUT]: 依赖官方 LlmAdapter/attribution API、EnterprisePlatformService 内存认证请求与 OpenAI 映射模块
 * [OUTPUT]: 对外提供动态目录、default sentinel、SSE/JSON 双媒体协商、单次尝试和可取消直连中心 HTTPS 的 EnterpriseGatewayAdapter
 * [POS]: llm-gateway 的 Harness provider 边界，不读取个人设置、上游 URL 或上游 credential
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto'
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  ReasoningEffortId,
  resolveRetryPolicy,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import {
  EnterprisePlatformError,
  type BootstrapSnapshot,
  type EnterprisePlatformStatus,
} from '@enterprise-agent/dsh-platform-client'
import { serializeRequest } from './serialize.js'
import { translateFrames } from './translate.js'
import { openAiSseFrames, OpenAiSseError } from './transport.js'

export const ENTERPRISE_PROVIDER = 'enterprise'
export const ENTERPRISE_DEFAULT_MODEL = 'enterprise/default'
export const ENTERPRISE_GATEWAY_PATH = '/enterprise/gateway/v1/chat/completions'

const OFF = ReasoningEffortId('off')
const HIGH = ReasoningEffortId('high')
const MAX = ReasoningEffortId('max')
const REASONING = Object.freeze({
  efforts: Object.freeze([
    { id: OFF, name: '关闭' },
    { id: HIGH, name: '高' },
    { id: MAX, name: '最高' },
  ]),
  defaultEffort: HIGH,
})
const SINGLE_ATTEMPT = resolveRetryPolicy({
  mode: 'normal',
  maxRetries: 0,
  retryableCodes: ['TRANSPORT'],
}, 'enterprise.retryPolicy')

export interface EnterprisePlatformPort {
  status(): EnterprisePlatformStatus
  bootstrap(): BootstrapSnapshot | undefined
  request(input: string | URL, init?: RequestInit): Promise<Response>
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void
}

export interface EnterpriseGatewayAdapterOptions {
  readonly platform: EnterprisePlatformPort
  readonly harnessVersion: string
  readonly bundleVersion: string
  readonly createIdempotencyKey?: () => string
}

function modelInfo(model: BootstrapSnapshot['models'][number]): LlmModelInfo {
  return {
    provider: ENTERPRISE_PROVIDER,
    id: model.alias,
    name: model.displayName,
    inputModalities: ['text'],
  }
}

function unavailable(status: EnterprisePlatformStatus): LlmError {
  switch (status.state) {
    case 'DEVICE_REVOKED':
      return new LlmError('enterprise device is revoked', 'ENT_DEVICE_REVOKED')
    case 'AUTH_EXPIRED':
      return new LlmError('enterprise platform session expired', 'ENT_AUTH_SESSION_EXPIRED')
    case 'SIGNED_OUT':
    case 'AUTHORIZING':
    case 'ENROLLING':
    case 'BOOTSTRAPPING':
    case 'CANCELLED':
      return new LlmError('enterprise platform login is required', 'ENT_AUTH_REQUIRED')
    case 'FAILED':
    case 'REFRESHING':
      return new LlmError('enterprise platform is unavailable', status.errorCode ?? 'ENT_PLATFORM_UNAVAILABLE')
    case 'READY':
      return new LlmError('enterprise model is not assigned', 'ENT_MODEL_NOT_ASSIGNED')
  }
}

function requestId(value: string | undefined): ReturnType<typeof ProviderRequestId> | undefined {
  return value === undefined || value.length === 0 ? undefined : ProviderRequestId(value)
}

/** Harness 官方 provider adapter；所有认证 fetch 只经 platform Service。 */
export class EnterpriseGatewayAdapter extends LlmAdapter {
  readonly #platform: EnterprisePlatformPort
  readonly #harnessVersion: string
  readonly #bundleVersion: string
  readonly #createIdempotencyKey: () => string

  constructor(options: EnterpriseGatewayAdapterOptions) {
    super()
    this.#platform = options.platform
    this.#harnessVersion = options.harnessVersion
    this.#bundleVersion = options.bundleVersion
    this.#createIdempotencyKey = options.createIdempotencyKey ?? randomUUID
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: '企业模型' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return SINGLE_ATTEMPT
  }

  override listModels(_provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve((this.#platform.bootstrap()?.models ?? []).map(modelInfo))
  }

  override resolveModel(
    _provider: string,
    requested: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    signal?.throwIfAborted()
    const snapshot = this.#platform.bootstrap()
    if (snapshot === undefined) return Promise.reject(unavailable(this.#platform.status()))
    const model = requested === ENTERPRISE_DEFAULT_MODEL
      ? snapshot.models.find(candidate => candidate.isDefault)
      : snapshot.models.find(candidate => candidate.alias === requested)
    if (model === undefined) {
      return Promise.reject(new LlmError('enterprise model is not assigned', 'ENT_MODEL_NOT_ASSIGNED'))
    }
    return Promise.resolve({
      ...modelInfo(model),
      id: requested,
      name: requested === ENTERPRISE_DEFAULT_MODEL ? `${model.displayName}（企业默认）` : model.displayName,
      context: { contextWindow: model.contextWindow },
      defaultMaxTokens: model.maxOutputTokens,
      ...model.reasoning ? { reasoning: REASONING } : {},
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const body = JSON.stringify(serializeRequest(options))
    const consumer = new AbortController()
    const signal = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    let iterator: AsyncIterator<StreamChunk> | undefined
    let exhausted = false
    try {
      const response = await this.#platform.request(ENTERPRISE_GATEWAY_PATH, {
        method: 'POST',
        headers: {
          ...attributionHeaders(),
          accept: 'text/event-stream, application/json',
          'content-type': 'application/json',
          'idempotency-key': this.#createIdempotencyKey(),
          'x-harness-version': this.#harnessVersion,
          'x-enterprise-bundle-version': this.#bundleVersion,
        },
        body,
        signal,
      })
      iterator = translateFrames(openAiSseFrames(response, signal))[Symbol.asyncIterator]()
      while (true) {
        const item = await iterator.next()
        if (item.done) {
          exhausted = true
          return
        }
        yield item.value
      }
    } catch (error) {
      if (options.signal?.aborted === true) {
        throw new LlmError('enterprise model request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      if (error instanceof EnterprisePlatformError) {
        const id = requestId(error.requestId)
        throw new LlmError('enterprise platform rejected the model request', error.code, {
          cause: error,
          ...error.httpStatus === undefined ? {} : { status: error.httpStatus },
          ...id === undefined ? {} : { requestId: id },
        })
      }
      if (error instanceof OpenAiSseError) {
        const id = requestId(error.requestId)
        throw new LlmError(error.message, error.code, {
          cause: error,
          ...error.status === undefined ? {} : { status: error.status },
          ...id === undefined ? {} : { requestId: id },
        })
      }
      throw new LlmError('enterprise model transport failed', 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort(new DOMException('enterprise model stream consumer stopped', 'AbortError'))
      if (!exhausted && iterator?.return !== undefined) {
        try {
          await iterator.return()
        } catch {
          // Abort already owns teardown; a reader-return failure adds no new outcome.
        }
      }
    }
  }
}
