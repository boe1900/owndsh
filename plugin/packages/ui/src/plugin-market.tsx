/**
 * [INPUT]: 依赖企业插件元数据、本机官方 pluginManager Remote、Input/Icon/Tag/Button/ConfirmAction primitives 与市场可见性控制器
 * [OUTPUT]: 提供企业插件市场弹窗与官方两行行式列表；搜索与刷新同排、分类另起一行，确认后的安装/更新/卸载委托官方 Remote
 * [POS]: 官方插件页唯一按钮展开的 OwnDsh 弹窗，不复制官方插件页及安装状态机
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Button, IconSearchOutlineRegular, Input, Modal, Pill, PluginArtworkDefault, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BundleInfo, ChangeResult, PluginInstallRequestId } from '@deepseek-ai/dsh-plugin-manager/types'
import gt from 'semver/functions/gt.js'
import valid from 'semver/functions/valid.js'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { EnterpriseAccountStore } from './account-store.js'
import { ConfirmAction } from './confirm-action.js'
import type { EnterprisePluginCatalogItem } from './local-api.js'
import css from './plugin-market.module.css'

import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-plugin-manager/remote'

type PluginManagerRemote = ClientContext['remote']['pluginManager']

export interface MarketController {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => boolean
  readonly open: () => void
  readonly close: () => void
}

export function createMarketController(): MarketController {
  const state = createSnapshotStore(false)
  return {
    subscribe: state.subscribe,
    getSnapshot: state.getSnapshot,
    open: () => { state.set(true) },
    close: () => { state.set(false) },
  }
}

interface EnterprisePluginMarketProps {
  readonly store: EnterpriseAccountStore
  readonly pluginManager: PluginManagerRemote
  readonly controller: MarketController
}

interface MarketRowProps {
  readonly item: EnterprisePluginCatalogItem
  readonly bundle?: BundleInfo | undefined
  readonly busy: boolean
  readonly onInstall: () => void
  readonly onRemove: () => void
}

type Operation = 'install' | 'update' | 'remove'

/** Return the only catalog operation allowed for this installed version. */
export function currentAction(item: EnterprisePluginCatalogItem, bundle?: BundleInfo): Operation | undefined {
  if (bundle?.version === undefined) return 'install'
  if (valid(item.version) && valid(bundle.version) && gt(item.version, bundle.version)) return 'update'
  return undefined
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  return String(value)
}

function resultError(result: ChangeResult): string | undefined {
  return result.application === 'failed' ? result.error?.diagnostic ?? '官方插件管理器执行失败' : undefined
}

function MarketRow({ item, bundle, busy, onInstall, onRemove }: MarketRowProps): ReactNode {
  const action = currentAction(item, bundle)
  const title = item.installation.displayName || item.packageName
  const description = item.installation.description || item.packageName
  const installed = bundle !== undefined
  const isUpdate = action === 'update'
  const installLabel = isUpdate ? '更新' : '安装'
  return (
    <li className={css.row} data-enterprise-plugin-package={item.packageName}>
      <div className={css.rowLine}>
        <span className={css.rowIcon} aria-hidden="true"><PluginArtworkDefault size={28} /></span>
        <div className={css.rowMain}>
          <div className={css.rowTitle}>
            <strong title={title}>{title}</strong>
            {item.installation.categories.map(category => <Tag key={category} className={css.category} tone="neutral">{category}</Tag>)}
            <Tag className={css.versionTag} tone="neutral">v{installed ? (bundle.version ?? item.version) : item.version}</Tag>
          </div>
          <p className={css.description}>{description}</p>
        </div>
        <div className={css.rowActions}>
          {installed ? <ConfirmAction title="卸载企业插件" description={`确定卸载“${title}”吗？`} confirmLabel="确认卸载" disabled={busy} onConfirm={onRemove}>
            {openConfirm => <Button size="sm" variant="ghost" disabled={busy} onClick={openConfirm}>卸载</Button>}
          </ConfirmAction> : null}
          <ConfirmAction title={`${installLabel}企业插件`} description={`确定${installLabel}“${title}”吗？`} confirmLabel={`确认${installLabel}`} disabled={busy || action === undefined} onConfirm={onInstall}>
            {openConfirm => <Button size="sm" variant="primary" disabled={busy || action === undefined} aria-busy={busy} onClick={openConfirm}>
              {busy ? <><StateDot state="ongoing" size={12} />处理中</> : action === 'update' ? '更新' : action === 'install' ? '安装' : '已安装'}
            </Button>}
          </ConfirmAction>
        </div>
      </div>
    </li>
  )
}

/** 官方插件页按钮展开的市场弹窗；默认展示全部企业插件。 */
export function EnterprisePluginMarket({ store, pluginManager, controller }: EnterprisePluginMarketProps): ReactNode {
  const open = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [bundles, setBundles] = useState<readonly BundleInfo[]>([])
  const [busy, setBusy] = useState<string>()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [notice, setNotice] = useState<string>()

  const refresh = async (): Promise<void> => {
    await store.refreshPlugins()
    const result = await pluginManager.listBundles()
    if (result.ok) setBundles(result.value)
    else setNotice(result.error.message)
  }

  useEffect(() => { if (open) void refresh() }, [open, store, pluginManager])

  const catalog = snapshot.pluginStatus?.catalog ?? []
  const installed = useMemo(() => new Map(bundles.map(bundle => [bundle.name, bundle])), [bundles])
  const categories = useMemo(() => [...new Set(catalog.flatMap(item => item.installation.categories))].sort(), [catalog])
  const rows = useMemo(() => catalog.filter(item => {
    const text = [item.packageName, item.installation.displayName, item.installation.description, ...item.installation.categories].join(' ').toLowerCase()
    return (!category || item.installation.categories.includes(category))
      && (!query.trim() || text.includes(query.trim().toLowerCase()))
  }), [catalog, category, query])

  const operate = async (item: EnterprisePluginCatalogItem, operation: Operation): Promise<void> => {
    if (busy !== undefined || snapshot.pluginErrorCode !== undefined) return
    setBusy(item.packageName)
    setNotice(undefined)
    try {
      const requestId = randomUUID() as PluginInstallRequestId
      if (operation === 'remove') {
        const result = await pluginManager.removeBundle(item.packageName)
        if (!result.ok) throw new Error(result.error.message)
        const failure = resultError(result.value)
        if (failure !== undefined) throw new Error(failure)
      } else {
        const result = await pluginManager.installBundle(item.installation.spec, { enabled: false, requestId })
        if (!result.ok) throw new Error(result.error.message)
        const failure = resultError(result.value)
        if (failure !== undefined) throw new Error(failure)
        if (result.value.bundle !== undefined) {
          const enabled = await pluginManager.setBundleEnabled(result.value.bundle, true)
          if (!enabled.ok) throw new Error(enabled.error.message)
          const enableFailure = resultError(enabled.value)
          if (enableFailure !== undefined) throw new Error(enableFailure)
        }
      }
      await refresh()
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(undefined)
    }
  }

  const close = (): void => { if (busy === undefined) controller.close() }
  return (
    <Modal open={open} onClose={close} title="插件市场" closeLabel="关闭" description="企业统一提供的插件，安装和更新由官方插件管理器执行。" className={css.dialog as string} contentClassName={css.content as string}>
      <section className={css.market} aria-label="插件市场">
        <div className={css.filters}>
          <div className={css.searchRow}>
            <Input
              className={css.search as string}
              icon={<IconSearchOutlineRegular aria-hidden="true" />}
              type="search"
              aria-label="搜索企业插件"
              placeholder="搜索插件名称、包名、描述或分类"
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
            />
            <Button size="sm" variant="outline" disabled={busy !== undefined} onClick={() => { void refresh() }}>刷新</Button>
          </div>
          {categories.length === 0 ? null : <div className={css.categories} role="group" aria-label="插件分类">
            <span className={css.filterLabel}>分类</span>
            {['', ...categories].map(value => <Pill key={value} active={category === value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value || '全部分类'}</Pill>)}
          </div>}
        </div>
        {notice === undefined ? null : <p className={css.notice} role="alert">{notice}</p>}
        {snapshot.status?.state !== 'READY' && snapshot.status?.state !== 'REFRESHING'
          ? <p className={css.empty}>登录企业账号后可用。</p>
          : rows.length === 0
            ? <p className={css.empty}>暂无匹配的企业插件。</p>
            : <ul className={css.list}>{rows.map(item => <MarketRow key={item.packageName} item={item} bundle={installed.get(item.packageName)} busy={busy === item.packageName} onInstall={() => { void operate(item, currentAction(item, installed.get(item.packageName)) ?? 'install') }} onRemove={() => { void operate(item, 'remove') }} />)}</ul>}
      </section>
    </Modal>
  )
}
