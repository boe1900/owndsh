/**
 * [INPUT]: 依赖官方 LlmRuntime registration handle、EnterprisePlatform 状态订阅与 EnterpriseGatewayAdapter
 * [OUTPUT]: 对外提供原子 `replace(['enterprise'])` 刷新和幂等 disposer 的 adapter 注册函数
 * [POS]: llm-gateway 的 Cordis 组合边界，仅在模型目录事实变化时发布官方 adapters-updated 事件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { AdapterRegistrationHandle, LlmRuntime } from '@deepseek-ai/dsh-llm'
import {
  ENTERPRISE_PROVIDER,
  EnterpriseGatewayAdapter,
  type EnterpriseGatewayAdapterOptions,
  type EnterprisePlatformPort,
} from './adapter.js'

function catalogFingerprint(platform: EnterprisePlatformPort): string {
  return JSON.stringify((platform.bootstrap()?.models ?? []).map(model => ({
    alias: model.alias,
    displayName: model.displayName,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    reasoning: model.reasoning,
    isDefault: model.isDefault,
  })))
}

/** 注册单一企业 route；返回的官方形状 disposer 同时保留 replace 能力。 */
export function registerEnterpriseGateway(
  llm: Pick<LlmRuntime, 'registerAdapter'>,
  options: EnterpriseGatewayAdapterOptions,
): AdapterRegistrationHandle {
  const adapter = new EnterpriseGatewayAdapter(options)
  const registration = llm.registerAdapter([ENTERPRISE_PROVIDER], adapter)
  let fingerprint = catalogFingerprint(options.platform)
  let disposed = false
  const unsubscribe = options.platform.subscribe(() => {
    const next = catalogFingerprint(options.platform)
    if (next === fingerprint) return
    fingerprint = next
    registration.replace([ENTERPRISE_PROVIDER])
  })
  const handle = (() => {
    if (disposed) return
    disposed = true
    unsubscribe()
    registration()
  }) as AdapterRegistrationHandle
  handle.replace = providers => { registration.replace(providers) }
  return handle
}
