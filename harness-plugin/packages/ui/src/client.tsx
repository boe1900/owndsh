/**
 * [INPUT]: 依赖官方 Client `slots` 服务、EnterpriseAccountStore 与三个企业账号 slot 组件
 * [OUTPUT]: 对外提供 Client apply，并注册 settings section、sidebar 状态和登录 onboarding
 * [POS]: dsh-ui 的浏览器组合根，只向 React 注入共享脱敏 store，不传递 Host Context
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react'
import { EnterpriseAccountStore } from './account-store.js'
import {
  EnterpriseFooterAction,
  EnterpriseOnboarding,
  EnterpriseSettingsSection,
} from './account-view.js'
import { createEnterpriseLocalApi } from './local-api.js'

export * from './account-store.js'
export * from './account-view.js'
export * from './local-api.js'

interface SlotContextPort {
  readonly slots: {
    inject(name: string, register: () => unknown): unknown
    register(
      options: Readonly<Record<string, unknown>>,
      component: (props: never) => ReactNode,
    ): unknown
  }
}

/** Required Client service; target declaration lifetime is handled by `slots.inject()`. */
export const inject = ['slots']

/** 注册三个官方 slot；网络能力只封装在共享 store 内。 */
export function apply(ctx: SlotContextPort): void {
  const store = new EnterpriseAccountStore(createEnterpriseLocalApi())
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'enterprise',
    order: 5,
    label: '企业',
    inject: () => ({ store }),
  }, EnterpriseSettingsSection as (props: never) => ReactNode))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'enterprise',
    order: 50,
    inject: () => ({ store }),
  }, EnterpriseFooterAction as (props: never) => ReactNode))
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'enterprise-login',
    order: -50,
    inject: () => ({ store }),
  }, EnterpriseOnboarding as (props: never) => ReactNode))
}
