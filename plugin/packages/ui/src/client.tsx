/**
 * [INPUT]: 依赖官方 slots/remote/connection 生命周期事件与 EnterpriseAccountStore，不创建传输连接
 * [OUTPUT]: 注册 OwnDsh 设置/访问门禁与官方插件管理页 fork；市场由官方页唯一按钮打开为弹窗
 * [POS]: dsh-ui 的浏览器组合根，只向 React 注入共享脱敏 store，不传递 Host Context
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react'
import { EnterpriseAccountStore } from './account-store.js'
import {
  EnterpriseAccessGate,
  EnterpriseSettingsSection,
} from './account-view.js'
import { createEnterpriseLocalApi } from './local-api.js'
import { createMarketController, EnterprisePluginMarket } from './plugin-market.js'
import { apply as applyPluginManager } from './plugin-manager/index.js'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

interface ClientRuntime {
  readonly slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Readonly<Record<string, unknown>>, component: (props: never) => ReactNode): unknown
  }
  readonly remote: ClientContext['remote']
  effect(effect: () => () => void, label: string): void
  on(event: string, listener: () => void): () => void
}

export * from './account-store.js'
export * from './account-view.js'
export * from './local-api.js'
export * from './plugin-market.js'

/** Required Client service; target declaration lifetime is handled by `slots.inject()`. */
export const inject = [
  'slots', 'locale', 'configForms', 'remote',
  'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe',
]

/** 复用官方插件页，只替换添加按钮的行为；网络能力只封装在共享 store 内。 */
export function apply(ctx: ClientContext): void {
  const runtime = ctx as unknown as ClientRuntime
  const store = new EnterpriseAccountStore(createEnterpriseLocalApi())
  const market = createMarketController()
  applyPluginManager(ctx, market.open)
  runtime.slots.inject('shell.overlay', () => runtime.slots.register({
    name: 'shell.overlay',
    id: 'enterprise-plugin-market',
    order: -90,
    inject: () => ({ store, pluginManager: runtime.remote.pluginManager, controller: market }),
  }, EnterprisePluginMarket))
  runtime.effect(() => {
    const refresh = () => { void store.refresh() }
    const disposers = [
      runtime.remote.$on('llm/adapters-updated', refresh),
      runtime.remote.$on('credentials/reference-updated', refresh),
      runtime.remote.$on('settings/document-updated', refresh),
      runtime.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'owndsh: refresh account on Host changes')
  runtime.slots.inject('settings.section', () => runtime.slots.register({
    name: 'settings.section',
    id: 'enterprise',
    order: 25,
    label: 'OwnDsh 设置',
    inject: () => ({ store }),
  }, EnterpriseSettingsSection as (props: never) => ReactNode))
  runtime.slots.inject('shell.overlay', () => runtime.slots.register({
    name: 'shell.overlay',
    id: 'enterprise-access',
    order: -100,
    inject: () => ({ store }),
  }, EnterpriseAccessGate as (props: never) => ReactNode))
}
