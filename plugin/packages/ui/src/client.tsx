/**
 * [INPUT]: 依赖官方 slots/remote/connection 生命周期事件与 EnterpriseAccountStore，不创建传输连接
 * [OUTPUT]: 注册账号/插件设置与门禁；宿主模型/凭据变化后按需读取状态，让请求触发的认证失效立即呈现
 * [POS]: dsh-ui 的浏览器组合根，只向 React 注入共享脱敏 store，不传递 Host Context
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react'
import { EnterpriseFooterAction } from './account-footer.js'
import { EnterpriseAccountStore } from './account-store.js'
import {
  EnterpriseAccessGate,
  EnterpriseSettingsSection,
} from './account-view.js'
import { createEnterpriseLocalApi } from './local-api.js'

export * from './account-store.js'
export * from './account-footer.js'
export * from './account-view.js'
export * from './local-api.js'
export * from './plugin-market.js'

interface SlotContextPort {
  readonly remote: {
    $on(event: 'llm/adapters-updated' | 'credentials/reference-updated' | 'settings/document-updated', listener: () => void): () => void
  }
  on(event: 'connection/reset', listener: () => void): () => void
  effect(effect: () => () => void, label: string): void
  readonly slots: {
    inject(name: string, register: () => unknown): unknown
    register(
      options: Readonly<Record<string, unknown>>,
      component: (props: never) => ReactNode,
    ): unknown
  }
}

/** Required Client service; target declaration lifetime is handled by `slots.inject()`. */
export const inject = ['slots', 'remote']

/** 复用三个官方 slot 类型注册账号与市场；网络能力只封装在共享 store 内。 */
export function apply(ctx: SlotContextPort): void {
  const store = new EnterpriseAccountStore(createEnterpriseLocalApi())
  ctx.effect(() => {
    const refresh = () => { void store.refresh() }
    const disposers = [
      ctx.remote.$on('llm/adapters-updated', refresh),
      ctx.remote.$on('credentials/reference-updated', refresh),
      ctx.remote.$on('settings/document-updated', refresh),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'owndsh: refresh account on Host changes')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'enterprise',
    order: 25,
    label: 'OwnDsh 设置',
    inject: () => ({ store }),
  }, EnterpriseSettingsSection as (props: never) => ReactNode))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'enterprise',
    order: 50,
    inject: () => ({ store }),
  }, EnterpriseFooterAction as (props: never) => ReactNode))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'enterprise-access',
    order: -100,
    inject: () => ({ store }),
  }, EnterpriseAccessGate as (props: never) => ReactNode))
}
