/**
 * [INPUT]: 依赖 Cordis fiber、官方 dsh-llm-pi-ai 插件、平台 bootstrap 订阅与 Host 私有认证代理
 * [OUTPUT]: 对外提供企业 profiles 指纹驱动的官方插件更新和完整幂等 disposer
 * [POS]: llm-gateway 的唯一组合入口；隔离个人 settings，协议实现与模型流生命周期均归官方插件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Context } from '@deepseek-ai/cordis'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import type {
  BootstrapSnapshot,
  EnterprisePlatformStatus,
} from '@owndsh/platform-client'
import { buildEnterpriseProfiles } from './profiles.js'
import {
  startEnterpriseProxy,
  type EnterpriseProxyPlatformPort,
} from './proxy.js'

export interface EnterprisePlatformPort extends EnterpriseProxyPlatformPort {
  bootstrap(): BootstrapSnapshot | undefined
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void
}

export interface EnterpriseGatewayOptions {
  readonly platform: EnterprisePlatformPort
  readonly harnessVersion: string
  readonly bundleVersion: string
}

/** 挂载并动态配置官方 adapter；返回 disposer，不自行实现任何 LLM wire 语义。 */
export async function registerEnterpriseGateway(ctx: Context, options: EnterpriseGatewayOptions): Promise<() => Promise<void>> {
  const proxy = await startEnterpriseProxy(options)
  const profiles = () => buildEnterpriseProfiles(
    options.platform.bootstrap(),
    proxy.baseURL,
    proxy.authorization,
  )
  const initial = { providers: profiles() }
  const official = ctx.isolate('settings').plugin(LlmPiAi, initial)
  let fingerprint = JSON.stringify(initial)
  let active = true
  let updates = Promise.resolve()

  const refresh = (): void => {
    const next = { providers: profiles() }
    const nextFingerprint = JSON.stringify(next)
    if (!active || nextFingerprint === fingerprint) return
    fingerprint = nextFingerprint
    updates = updates.then(async () => {
      await official
      if (active) await official.update(next, true)
    }).catch((error: unknown) => {
      ctx.logger.error('enterprise llm: official profile update failed')
      ctx.logger.error(error)
    })
  }
  const unsubscribe = options.platform.subscribe(refresh)
  try {
    await official
  } catch (error) {
    unsubscribe()
    await proxy.dispose()
    throw error
  }

  return async () => {
    if (!active) return
    active = false
    unsubscribe()
    try {
      await updates
      await official.dispose()
    } finally {
      await proxy.dispose()
    }
  }
}
