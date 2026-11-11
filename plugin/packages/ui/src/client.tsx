/**
 * [INPUT]: 依赖官方 slots/remote/configForms/connection 生命周期事件、账号 store 与前置注入的非秘密远端 view 元数据
 * [OUTPUT]: 本机注册 OwnDsh 设置、账号/远程入口与访问门禁；独立远端页面仅注册持续目标条和断线阻断，避免本机控制面接入远端 settings
 * [POS]: dsh-ui 的浏览器组合根，只向 React 注入共享脱敏 store 和配置表单，不传递 Host Context
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react'
import { EnterpriseAccountStore } from './account-store.js'
import { EnterpriseAccountLauncher } from './account-launcher.js'
import { EnterpriseSkillStore } from './skill-store.js'
import {
  EnterpriseAccessGate,
  EnterpriseSettingsSection,
  type EnterpriseConfigForm,
} from './account-view.js'
import { createEnterpriseLocalApi } from './local-api.js'
import { createRemoteLocalApi, readRemoteView } from './remote-api.js'
import { RemoteWorkspaceStore } from './remote-store.js'
import { InvalidRemoteWorkspace, RemoteWorkspaceBanner, RemoteWorkspaceBarrier } from './remote-workspace.js'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

interface ClientRuntime {
  readonly slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Readonly<Record<string, unknown>>, component: (props: never) => ReactNode): unknown
  }
  readonly remote: ClientContext['remote']
  readonly configForms: {
    get(namespace: string): EnterpriseConfigForm
  }
  effect(effect: () => () => void, label: string): void
  on(event: string, listener: () => void): () => void
}

export * from './account-store.js'
export * from './account-launcher.js'
export * from './account-view.js'
export * from './local-api.js'
export * from './skill-store.js'

declare global {
  interface Window { readonly __OWNDSH_REMOTE_VIEW__?: unknown }
}

/** Required Client service; target declaration lifetime is handled by `slots.inject()`. */
export const inject = [
  'slots', 'remote', 'configForms',
]

/** 企业设置、侧栏账号入口与门禁共享账号状态；插件市场由官方 Discover 页面负责。 */
export function apply(ctx: ClientContext): void {
  const runtime = ctx as unknown as ClientRuntime
  const remoteApi = createRemoteLocalApi(fetch)
  const viewContext = readRemoteView(typeof window === 'undefined' ? undefined : window.__OWNDSH_REMOTE_VIEW__, typeof window === 'undefined' ? '/' : window.location.pathname)
  if (viewContext.kind === 'invalid') {
    runtime.slots.inject('shell.overlay', () => runtime.slots.register({ name: 'shell.overlay', id: 'enterprise-remote-invalid', order: -1000 }, InvalidRemoteWorkspace))
    return
  }
  if (viewContext.kind === 'remote') {
    const remoteStore = new RemoteWorkspaceStore(remoteApi, viewContext.view, url => window.location.assign(url))
    runtime.slots.inject('shell.bottom', () => runtime.slots.register({ name: 'shell.bottom', priority: -100, inject: () => ({ store: remoteStore }) }, RemoteWorkspaceBanner as (props: never) => ReactNode))
    runtime.slots.inject('shell.overlay', () => runtime.slots.register({ name: 'shell.overlay', id: 'enterprise-remote-barrier', order: -1000, inject: () => ({ store: remoteStore }) }, RemoteWorkspaceBarrier as (props: never) => ReactNode))
    return
  }
  const localApi = createEnterpriseLocalApi(fetch)
  const store = new EnterpriseAccountStore(localApi)
  const skillStore = new EnterpriseSkillStore(localApi)
  runtime.effect(() => {
    const refresh = () => {
      skillStore.reset()
      void store.refresh().then(() => skillStore.refresh())
    }
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
    inject: () => ({
      store,
      skillStore,
      configForm: runtime.configForms.get('owndsh'),
    }),
  }, EnterpriseSettingsSection as (props: never) => ReactNode))
  runtime.slots.inject('shell.overlay', () => runtime.slots.register({
    name: 'shell.overlay',
    id: 'enterprise-access',
    order: -100,
    inject: () => ({ store }),
  }, EnterpriseAccessGate as (props: never) => ReactNode))
  runtime.slots.inject('settings.launcher', () => runtime.slots.register({
    name: 'settings.launcher',
    priority: -100,
    inject: () => ({ store, remoteApi }),
  }, EnterpriseAccountLauncher as (props: never) => ReactNode))
}
