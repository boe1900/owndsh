/**
 * [INPUT]: 依赖企业目录/本机事实、账号 store 的安装忙碌态与错误、semver、Harness Modal/Button/Input/Pill/Tooltip/StateDot
 * [OUTPUT]: 提供原型市场卡片和精简详情；固定版本安装保留弹窗，呈现进度、失败重试与完成后手动重启提示，启用状态只取 Host 事实
 * [POS]: ui 的员工插件管理视图，由 OwnDsh 设置的插件 tab 承载，数据与执行由 OwnDsh Host 拥有
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Button, Input, Modal, Pill, StateDot, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { ExternalLink, ListFilter, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import gt from 'semver/functions/gt.js'
import valid from 'semver/functions/valid.js'
import type { EnterpriseAccountStore } from './account-store.js'
import { ConfirmAction } from './confirm-action.js'
import type { EnterprisePluginCatalogItem, EnterprisePluginItem, ManagedPluginState } from './local-api.js'

const STATES: Record<ManagedPluginState, { title: string; description: string; color: string }> = {
  EXPECTED: { title: '未安装', description: '可选择安装', color: 'var(--dsw-alias-label-secondary,#667085)' },
  INSTALLING: { title: '正在安装', description: '正在更新本机插件', color: 'var(--dsw-alias-state-business-primary,#2563eb)' },
  RESTART_REQUIRED: { title: '等待重启', description: '重启 Harness 后生效', color: 'var(--dsw-alias-status-warning,#b54708)' },
  ACTIVE: { title: '已启用', description: '插件已启用', color: 'var(--dsw-alias-state-success-primary,#16803c)' },
  REMOVE_PENDING: { title: '等待卸载', description: '卸载操作即将开始', color: 'var(--dsw-alias-status-warning,#b54708)' },
  REMOVING: { title: '正在卸载', description: '正在更新本机插件', color: 'var(--dsw-alias-status-warning,#b54708)' },
  FAILED: { title: '处理失败', description: '请重试', color: 'var(--dsw-alias-status-error,#c4320a)' },
  ROLLBACK: { title: '切换版本', description: '正在安装所选版本', color: 'var(--dsw-alias-state-business-primary,#2563eb)' },
}

export const enterprisePluginStatePresentation = (state: ManagedPluginState) => STATES[state]

const ERRORS: Record<string, string> = {
  ENT_PLUGIN_INCOMPATIBLE: '安装地址不可用，或实际包名、版本、插件入口与配置不符',
  ENT_PERMISSION_DENIED: '插件已下架或可见范围已变更，请刷新',
  ENT_PLUGIN_BUSY: '另一项插件操作正在进行',
  ENT_PLUGIN_MANAGER_FAILED: '官方插件管理器执行失败，请重试',
  ENT_PLUGIN_LOADER_INACTIVE: '插件未能启动，请重试或卸载',
  ENT_AUTH_REQUIRED: '请先登录企业账号',
}
const errorMessage = (code: string) => ERRORS[code] ?? `插件操作失败 (${code})`

export function enterprisePluginCardPresentation(item?: EnterprisePluginCatalogItem, record?: EnterprisePluginItem) {
  // ---- 过渡事实优先，只有更高语义版本才提示更新 ----
  if (record && !['ACTIVE', 'EXPECTED', 'FAILED'].includes(record.state)) {
    return { tone: 'pending', label: STATES[record.state].title, hint: `${STATES[record.state].title}：${STATES[record.state].description}`, action: STATES[record.state].title }
  }
  const issue = record?.lastErrorCode ?? item?.installErrorCode
  if (issue || record?.state === 'FAILED') {
    const label = issue === 'ENT_PLUGIN_INCOMPATIBLE' ? '环境不兼容' : issue === 'ENT_PLUGIN_LOADER_INACTIVE' ? '已停用' : '处理失败'
    return { tone: 'unavailable', label, hint: issue ? `${label}：${errorMessage(issue)}` : '处理失败，请重试', action: item?.installErrorCode === 'ENT_PLUGIN_INCOMPATIBLE' ? '环境不符' : item?.installErrorCode ? '暂不可安装' : '查看详情' }
  }
  if (record?.desiredState === 'ABSENT') return { tone: 'unavailable', label: '已停用', hint: '已停用', action: '查看详情' }
  if (record?.state === 'ACTIVE') {
    if (item && record.version && valid(item.version) && valid(record.version) && gt(item.version, record.version)) {
      return { tone: 'update', label: '有新版本待更新', hint: `有新版本待更新：v${record.version} → v${item.version}`, action: `更新到 ${item.version}` }
    }
    const versionChanged = item && item.version !== record.version
    return { tone: 'enabled', label: '已启用', hint: versionChanged ? `已启用 v${record.version}，企业版本为 v${item.version}` : '已启用', action: versionChanged ? '切换版本' : '已启用' }
  }
  return { tone: 'uninstalled', label: '未安装', hint: '未安装', action: item ? '安装' : '查看详情' }
}

function repositoryHref(value: string): string | undefined {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined }
  catch { return undefined }
}

/*!
 * Card layout adapted from DSH Desktop: https://github.com/anywhere-labs/dsh-desktop/tree/423406fe225442995902015cb6f10eed670ff115/dsh-community-market/src/client
 *
 * MIT License
 *
 * Copyright (c) 2026 Anywhere Labs
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const styles = `
.own-market,.own-market-dialog{min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;--own-solid:#0f172a;--own-solid-hover:#1e293b;--own-solid-text:#fff;--own-soft:#f1f5f9;--own-soft-hover:#e2e8f0;--own-muted:#64748b;--own-line:#e2e8f0;--own-update-bg:#fffbeb;--own-update-hover:#fef3c7;--own-update-border:#fde68a;--own-update-text:#92400e}
body[data-ds-dark-theme] .own-market,body[data-ds-dark-theme] .own-market-dialog{--own-solid:#e2e8f0;--own-solid-hover:#f8fafc;--own-solid-text:#0f172a;--own-soft:var(--dsw-alias-bg-layer-2);--own-soft-hover:var(--dsw-alias-interactive-bg-hover);--own-muted:var(--dsw-alias-label-tertiary);--own-line:var(--dsw-alias-border-l2);--own-update-bg:#302819;--own-update-hover:#3d321d;--own-update-border:#66512a;--own-update-text:#fcd34d}
.own-market *,.own-market-dialog *{box-sizing:border-box}
.own-market-filters{padding:0 0 18px;margin-bottom:20px;border-bottom:1px solid var(--own-line)}
.own-market-toolbar,.own-market-browse,.own-market-actions{display:flex;align-items:center;gap:10px}
.own-market-browse{justify-content:space-between;gap:16px;flex-wrap:wrap}
.own-market-tabs{display:inline-flex;align-items:center;gap:3px;padding:4px;border-radius:10px;background:var(--own-soft);flex-shrink:0}
.own-market-tabs button{appearance:none;border:0;border-radius:7px;padding:6px 11px;background:transparent;color:var(--own-muted);font:inherit;font-size:12px;line-height:20px;cursor:pointer;white-space:nowrap}
.own-market-tabs button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px #0000000d;font-weight:600}
.own-market-count{margin-left:5px;color:var(--own-muted);font-size:11px;font-weight:400;font-variant-numeric:tabular-nums}
.own-market-toolbar{flex:1;justify-content:flex-end;min-width:200px}
.own-market-search{min-width:0;width:100%;max-width:260px}
.own-market-search input{font-size:12px}
.own-market-search input::placeholder{color:var(--own-muted);opacity:.8}
.own-market .own-market-refresh{flex-shrink:0;width:32px;height:32px;padding:0;border:1px solid var(--own-line);border-radius:8px;background:var(--dsw-alias-bg-layer-3)}
.own-market-categories{display:flex;align-items:center;gap:8px;overflow-x:auto;padding:16px 1px 2px;scrollbar-width:thin}
.own-market-categories>span:first-child{display:flex;align-items:center;gap:5px;margin-right:2px;color:var(--own-muted);font-size:12px;white-space:nowrap}
.own-market .own-market-categories button{flex-shrink:0;border:1px solid var(--own-line);border-radius:8px;padding:4px 11px;background:var(--dsw-alias-bg-layer-3);color:var(--own-muted);font-size:12px;line-height:18px}
.own-market .own-market-categories button[aria-pressed=true]{background:var(--own-solid);color:var(--own-solid-text);border-color:var(--own-solid)}
.own-market-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.own-market-card{position:relative;display:flex;flex-direction:column;min-width:0;padding:20px;border:1px solid var(--own-line);border-radius:20px;background:var(--dsw-alias-bg-layer-3);transition:border-color .18s,box-shadow .18s}
.own-market-card:hover{border-color:var(--dsw-alias-border-l3);box-shadow:var(--dsw-shadow-lv1)}
.own-market-card-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding-bottom:12px;border-bottom:1px solid var(--own-line)}
.own-market-card-identity{display:flex;align-items:center;gap:8px;min-width:0}
.own-market-card-title{appearance:none;padding:0;border:0;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:none;color:inherit;font:inherit;font-size:14px;line-height:20px;font-weight:600;cursor:pointer;text-align:left}
.own-market-card-title::after{content:'';position:absolute;inset:0;border-radius:20px}
.own-market-card-title:focus-visible{outline:none}
.own-market-card-title:focus-visible::after{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
.own-market-version{flex-shrink:0;max-width:90px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:1px 5px;border:1px solid var(--own-line);border-radius:4px;background:var(--own-soft);color:var(--own-muted);font:11px/16px ui-monospace,SFMono-Regular,Menlo,monospace}
.own-market-source{flex-shrink:0;max-width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--own-muted);font-size:11px}
.own-market-status{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:16px;height:20px;border-radius:4px;cursor:help}
.own-market-dot{display:block;width:8px;height:8px;border-radius:50%;background:#cbd5e1;flex-shrink:0}
.own-market-dot[data-tone=enabled]{background:#10b981}
.own-market-dot[data-tone=update]{background:#f59e0b;animation:own-market-update 2.4s ease-in-out infinite}
.own-market-dot[data-tone=unavailable]{background:#f87171}
.own-market-dot[data-tone=pending]{background:var(--dsw-alias-label-tertiary)}
@keyframes own-market-update{0%,100%{opacity:1}50%{opacity:.4}}
.own-market-description{display:-webkit-box;height:40px;margin:12px 0 0;overflow:hidden;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.own-market-card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid var(--own-line)}
.own-market-tags{display:flex;gap:5px;min-width:0;overflow:hidden}
.own-market .own-market-tags>span{min-width:0;max-width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:2px 7px;border:0;border-radius:5px;background:var(--own-soft);color:var(--own-muted);font-size:11px;line-height:18px}
.own-market .own-market-card-action{position:relative;z-index:1;flex-shrink:0;height:30px;padding:0 12px;border:1px solid transparent;border-radius:8px;background:var(--own-soft);color:var(--own-muted);font-weight:500}
.own-market .own-market-card-action:hover:not(:disabled){background:var(--own-soft-hover)}
.own-market .own-market-card-action[data-tone=uninstalled]{background:var(--own-solid);color:var(--own-solid-text)}
.own-market .own-market-card-action[data-tone=uninstalled]:hover:not(:disabled){background:var(--own-solid-hover)}
.own-market .own-market-card-action[data-tone=update]{background:var(--own-update-bg);border-color:var(--own-update-border);color:var(--own-update-text)}
.own-market .own-market-card-action[data-tone=update]:hover:not(:disabled){background:var(--own-update-hover)}
.own-market .own-market-card-action:disabled{opacity:1;background:var(--own-soft);color:var(--own-muted);border-color:transparent;cursor:not-allowed}
.own-market-card-action .own-market-dot{width:6px;height:6px;margin-right:2px}
.own-market-actions{flex-wrap:wrap}
.own-market-empty{text-align:center;padding:44px 12px;color:var(--dsw-alias-label-tertiary)}
.own-market-empty p{margin:0 0 10px}
.own-market-summary{padding-top:16px;color:var(--own-muted);font-size:11px}
.own-market-notice{padding:10px 12px;margin-bottom:14px;border:1px solid var(--own-line);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;overflow-wrap:anywhere}
.own-market-error{color:var(--dsw-alias-state-error-primary)}
.own-market-dialog.own-market-detail{box-sizing:border-box;width:min(512px,100%);padding:24px;max-height:calc(100dvh - 48px);overflow-y:auto;border-radius:16px;background:var(--dsw-alias-bg-layer-3)}
.own-market-detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--own-line)}
.own-market-detail-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.own-market-detail-title h3{margin:0;font-size:16px;line-height:24px;font-weight:600;overflow-wrap:anywhere}
.own-market-detail-title .own-market-version{max-width:none;white-space:normal;overflow-wrap:anywhere}
.own-market-detail-author{margin:5px 0 0;color:var(--own-muted);font-size:12px;overflow-wrap:anywhere}
.own-market-dialog .own-market-detail-close{flex-shrink:0;width:28px;height:28px;padding:0;border-radius:8px;color:var(--own-muted)}
.own-market-detail-body{padding-top:16px}
.own-market-detail-body h4{margin:0;font-size:12px;font-weight:500;color:var(--own-muted)}
.own-market-detail-description{margin:6px 0 18px;max-height:256px;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:22px;color:var(--dsw-alias-label-secondary)}
.own-market-detail-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}
.own-market-detail-meta>div{min-width:0;padding:12px;border-radius:10px;background:var(--own-soft)}
.own-market-detail-meta dt{font-size:11px;color:var(--own-muted)}
.own-market-detail-meta dd{margin:5px 0 0;font-size:12px;line-height:18px;overflow-wrap:anywhere}
.own-market-detail-meta a{display:inline-flex;align-items:center;gap:5px;color:inherit;text-decoration:none}
.own-market-detail-meta a:hover{text-decoration:underline}
.own-market-detail-message{margin:14px 0 0;font-size:12px;line-height:20px;color:var(--own-muted);overflow-wrap:anywhere}
.own-market-detail-feedback{display:flex;align-items:center;gap:10px;margin-top:16px;padding:12px;border-radius:10px;background:var(--own-soft);font-size:13px;line-height:20px;overflow-wrap:anywhere}
.own-market-detail-feedback[role=alert]{color:var(--dsw-alias-state-error-primary)}
.own-market-detail-feedback small{display:block;margin-top:4px;color:var(--own-muted);font-size:12px}
.own-market-detail-footer{justify-content:flex-end;margin-top:24px}
.own-market-detail-footer>button{border-radius:8px}
.own-market-dialog .own-market-confirm{border-radius:8px;background:var(--own-solid);color:var(--own-solid-text)}
.own-market-dialog .own-market-confirm:hover:not(:disabled){background:var(--own-solid-hover)}
.own-market-dialog .own-market-confirm[data-tone=update]{background:var(--own-update-bg);border:1px solid var(--own-update-border);color:var(--own-update-text)}
.own-market-dialog .own-market-confirm[data-tone=update]:hover:not(:disabled){background:var(--own-update-hover)}
@media(max-width:680px){.own-market-grid{grid-template-columns:1fr}.own-market-toolbar{flex-basis:100%;justify-content:stretch}.own-market-search{max-width:none;flex:1}.own-market-card{padding:18px}}
@media(prefers-reduced-motion:reduce){.own-market-dot[data-tone=update]{animation:none}.own-market-card{transition:none}}
`

export function EnterprisePluginMarket({ store }: {
  readonly store: EnterpriseAccountStore
}): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [view, setView] = useState<'all' | 'installed'>('all')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [selectedCatalog, setSelectedCatalog] = useState<EnterprisePluginCatalogItem>()
  const [selected, setSelected] = useState<string>()
  const [installAttempt, setInstallAttempt] = useState<string>()
  const [restartDismissed, setRestartDismissed] = useState(false)
  const details = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected === undefined) return
    const root = details.current?.closest<HTMLElement>('[role="dialog"]')
    if (!root) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    root.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); setSelected(undefined) }
      if (event.key !== 'Tab') return
      const buttons = root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    root.addEventListener('keydown', onKeyDown)
    return () => { root.removeEventListener('keydown', onKeyDown); if (previous?.isConnected) previous.focus() }
  }, [selected])
  const status = snapshot.pluginStatus
  const connected = snapshot.status?.state === 'READY' || snapshot.status?.state === 'REFRESHING'
  useEffect(() => {
    setSelected(undefined)
    setSelectedCatalog(undefined)
    setInstallAttempt(undefined)
  }, [connected, snapshot.status?.platformUrl, snapshot.status?.user?.id])
  const catalog = connected ? status?.catalog ?? [] : []
  const local = new Map((connected ? status?.plugins ?? [] : []).map(item => [item.packageName, item]))
  const available = new Map(catalog.map(item => [item.packageName, item]))
  const names = [...new Set([...available.keys(), ...local.keys()])]
  const installed = (name: string) => local.get(name)?.desiredState === 'INSTALLED' && local.get(name)?.version != null
  const categories = [...new Set(catalog.flatMap(item => item.installation?.categories ?? []))].sort()
  const rows = names.filter(name => {
    const metadata = available.get(name)?.installation
    return (view === 'all' || installed(name))
      && (!category || metadata?.categories.includes(category))
      && [name, metadata?.displayName, metadata?.description, metadata?.author]
        .some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))
  })
  const openDetails = (name: string) => { setSelectedCatalog(available.get(name)); setSelected(name) }
  const busy = snapshot.pluginBusy !== undefined || snapshot.busy !== undefined
  const fatal = status?.fatalErrorCode
  const selectedItem = selectedCatalog
  const selectedLocal = selected === undefined ? undefined : local.get(selected)
  const selectedInstalling = selected !== undefined && snapshot.pluginBusy?.packageName === selected && snapshot.pluginBusy.action === 'install'
  const selectedRemoving = selected !== undefined && snapshot.pluginBusy?.packageName === selected && snapshot.pluginBusy.action === 'remove'
  useEffect(() => {
    // 操作按钮禁用会丢失焦点；移到关闭按钮，保持 Tab/Escape 在详情内。
    if (selectedInstalling || selectedRemoving) details.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [selectedInstalling, selectedRemoving])
  const selectedWaiting = !selectedInstalling && !selectedRemoving && selectedLocal?.state === 'RESTART_REQUIRED'
  const selectedError = selectedInstalling || selectedRemoving ? undefined : fatal
    ?? (installAttempt === selected ? snapshot.pluginErrorCode : undefined)
    ?? selectedLocal?.lastErrorCode ?? selectedItem?.installErrorCode
  const selectedVersion = (selectedLocal?.desiredState === 'INSTALLED' ? selectedLocal.version : undefined) ?? selectedItem?.version
  const selectedSource = selectedItem?.installation.repositoryUrl ? repositoryHref(selectedItem.installation.repositoryUrl) : undefined
  const selectedSourceHost = selectedSource ? new URL(selectedSource).hostname.replace(/^www\./, '') : undefined
  const restartRequired = [...local.values()].some(item => item.state === 'RESTART_REQUIRED')
  useEffect(() => { if (!restartRequired) setRestartDismissed(false) }, [restartRequired])
  const actions = (name: string) => {
    const item = selectedItem
    const record = local.get(name)
    const waiting = record?.state === 'RESTART_REQUIRED'
    const sameVersion = record?.desiredState === 'INSTALLED' && record.version === item?.version && record.state === 'ACTIVE'
    return <div className="own-market-actions own-market-detail-footer">
      <Button size="sm" variant={selectedWaiting ? 'primary' : 'ghost'} className={selectedWaiting ? 'own-market-confirm' : undefined}
        disabled={busy} onClick={() => setSelected(undefined)}>{selectedWaiting ? '完成' : '关闭'}</Button>
      {!waiting && record?.version != null && (record.desiredState === 'INSTALLED' || record.state === 'FAILED') ? <ConfirmAction
        title="卸载企业插件" description={name} confirmLabel="确认卸载" disabled={busy || !connected || fatal !== undefined}
        onConfirm={() => { void store.removePlugin(name) }}>
        {open => <Button size="sm" variant="ghost" aria-label={`卸载 ${name}`} title="卸载" disabled={busy || !connected || fatal !== undefined}
          aria-busy={selectedRemoving} icon={selectedRemoving ? <StateDot state="ongoing" size={12} /> : <Trash2 size={14} aria-hidden />} onClick={open}>{selectedRemoving ? '卸载中…' : '卸载'}</Button>}
      </ConfirmAction> : null}
      {item && !sameVersion && !waiting ? <Button size="sm" variant="primary" className="own-market-confirm" data-tone={enterprisePluginCardPresentation(item, record).tone}
        disabled={busy || !connected || fatal !== undefined || item.installErrorCode !== undefined || item.pluginVersionId !== available.get(name)?.pluginVersionId}
        aria-busy={selectedInstalling}
        icon={selectedInstalling ? <StateDot state="ongoing" size={12} /> : undefined}
        onClick={() => { setInstallAttempt(name); void store.installPlugin(name, item.pluginVersionId) }}>
        {selectedInstalling ? '安装中…' : selectedError && !item.installErrorCode ? '重试安装' : enterprisePluginCardPresentation(item, record).tone === 'update' ? '确认更新' : '确认安装'}
      </Button> : null}
    </div>
  }

  return <section className="own-market" aria-label="企业插件市场">
    <style>{styles}</style>
    <div className="own-market-filters">
      <div className="own-market-browse">
        <div className="own-market-tabs" role="group" aria-label="插件视图">
          <button type="button" aria-label="全部插件" aria-pressed={view === 'all'} onClick={() => setView('all')}>全部插件 <span className="own-market-count">{names.length}</span></button>
          <button type="button" aria-label={`已安装 (${names.filter(installed).length})`} aria-pressed={view === 'installed'} onClick={() => setView('installed')}>已安装 <span className="own-market-count">{names.filter(installed).length}</span></button>
        </div>
        <div className="own-market-toolbar">
          <Input className="own-market-search" icon={<Search size={15} aria-hidden />} type="search" aria-label="搜索企业插件" placeholder="搜索名称、简介、作者…" value={query} onChange={event => setQuery(event.currentTarget.value)} />
          <Tooltip label="刷新插件" side="top"><span style={{ display: 'inline-flex' }}><Button size="sm" variant="ghost" className="own-market-refresh" aria-label="刷新插件" disabled={!connected || snapshot.pluginsLoading || busy}
            icon={<RefreshCw size={15} aria-hidden />} onClick={() => { void store.refreshPlugins() }} /></span></Tooltip>
        </div>
      </div>
      {categories.length > 0 ? <div className="own-market-categories" role="group" aria-label="插件分类">
        <span><ListFilter size={14} aria-hidden />分类</span>
        {['', ...categories].map(value => <Pill key={value} active={category === value}
          aria-pressed={category === value} onClick={() => setCategory(value)}>{value || '全部分类'}</Pill>)}
      </div> : null}
    </div>
    {restartRequired ? <div className="own-market-notice" role="status">插件变更已保存，重启客户端后生效。
      {!restartDismissed && status?.canRestart ? <div className="own-market-actions" style={{ marginTop: 8 }}>
        <Button size="sm" disabled={busy} onClick={() => { void store.restartPlugins() }}>{snapshot.busy === 'restart' ? '正在重启' : '立即重启'}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRestartDismissed(true)}>稍后重启</Button>
      </div> : !status?.canRestart ? <span>请完全退出并重新打开客户端。</span> : null}
    </div> : null}
    {snapshot.pluginErrorCode || fatal || snapshot.errorCode ? <div className="own-market-notice own-market-error" role="alert">{errorMessage(snapshot.pluginErrorCode ?? fatal ?? snapshot.errorCode!)}</div> : null}
    {status?.lastReportErrorCode ? <div className="own-market-notice" role="status">设备状态暂未上报</div> : null}
    {!connected ? <div className="own-market-empty">登录企业账号后可用</div> : snapshot.pluginsLoading && !status ? <div className="own-market-empty" role="status">正在加载插件</div> : rows.length === 0 ? <div className="own-market-empty"><p>{query || category ? '没有匹配的插件' : view === 'installed' ? '尚未安装企业插件' : '暂无可用企业插件'}</p>
      {query || category ? <Button size="sm" variant="outline" onClick={() => { setQuery(''); setCategory(''); setView('all') }}>重置筛选</Button> : null}
    </div> : null}
    <div className="own-market-grid">
      {rows.map(name => {
        const item = available.get(name)
        const record = local.get(name)
        const metadata = item?.installation
        const source = metadata?.repositoryUrl ? repositoryHref(metadata.repositoryUrl) : undefined
        const sourceHost = source ? new URL(source).hostname.replace(/^www\./, '') : undefined
        const installing = snapshot.pluginBusy?.packageName === name && snapshot.pluginBusy.action === 'install'
        const removing = snapshot.pluginBusy?.packageName === name && snapshot.pluginBusy.action === 'remove'
        const pending = installing || removing
        const presentation = installing ? { tone: 'pending', hint: '正在安装：请稍候', action: '正在安装' }
          : removing ? { tone: 'pending', hint: '正在卸载：请稍候', action: '正在卸载' }
          : enterprisePluginCardPresentation(item, record)
        const title = metadata?.displayName ?? name
        const version = record?.version ?? item?.version
        return <article className="own-market-card" key={name} aria-label={title}
          data-enterprise-plugin-package={name} data-enterprise-plugin-state={record?.state ?? 'AVAILABLE'}>
          <div className="own-market-card-heading">
            <div className="own-market-card-identity">
              <Tooltip label={presentation.hint} side="top" maxWidth={280}>
                <span className="own-market-status" tabIndex={0} role="img" aria-label={`${title}：${presentation.hint}`}>
                  <span className="own-market-dot" data-tone={presentation.tone} aria-hidden />
                </span>
              </Tooltip>
              <button type="button" className="own-market-card-title" title={title} aria-label={`查看详情: ${title}`} aria-haspopup="dialog" onClick={() => openDetails(name)}>{title}</button>
              {version ? <span className="own-market-version" title={`v${version}`}>v{version}</span> : null}
            </div>
            <span className="own-market-source" title={source}>{sourceHost === 'github.com' ? 'GitHub' : sourceHost || '企业目录'}</span>
          </div>
          <p className="own-market-description">{metadata?.description || (item ? name : '已不在企业目录中')}</p>
          <div className="own-market-card-footer">
            <div className="own-market-tags">
              {(metadata?.categories.length ? metadata.categories.slice(0, 2) : ['未分类']).map(value => <Pill key={value}>{value}</Pill>)}
            </div>
            <Button size="sm" className="own-market-card-action" data-tone={presentation.tone} aria-haspopup="dialog" aria-label={`${presentation.action}: ${title}`}
              aria-busy={pending} icon={pending ? <StateDot state="ongoing" size={12} /> : undefined}
              disabled={busy || presentation.tone === 'pending' || item?.installErrorCode !== undefined} onClick={() => openDetails(name)}>
              {['enabled', 'update'].includes(presentation.tone) ? <span className="own-market-dot" data-tone={presentation.tone} aria-hidden /> : null}
              {presentation.action}
            </Button>
          </div>
        </article>
      })}
    </div>
    {connected && status ? <div className="own-market-summary">已展示 {rows.length} 个插件</div> : null}
    <Modal open={connected && selected !== undefined} onClose={() => { if (!busy) setSelected(undefined) }} headless className="own-market-dialog own-market-detail" title={selectedItem?.installation?.displayName ?? '插件详情'}>
      <div ref={details}>
        <div className="own-market-detail-header">
          <div>
            <div className="own-market-detail-title">
              <h3>{selectedItem?.installation.displayName ?? '插件详情'}</h3>
              {selectedVersion ? <span className="own-market-version">v{selectedVersion}{selectedItem && selectedVersion !== selectedItem.version ? ` → v${selectedItem.version}` : ''}</span> : null}
            </div>
            <p className="own-market-detail-author">开发者：{selectedItem?.installation.author || '企业发布'}</p>
          </div>
          <Button size="sm" variant="ghost" className="own-market-detail-close" aria-label="关闭详情" disabled={busy} icon={<X size={18} aria-hidden />} onClick={() => setSelected(undefined)} />
        </div>
        <div className="own-market-detail-body">
          <h4>功能说明</h4>
          <p className="own-market-detail-description">{selectedItem ? selectedItem.installation.description || '暂无简介' : '该插件已不在企业目录中。'}</p>
          <dl className="own-market-detail-meta">
            <div><dt>所属分类</dt><dd>{selectedItem?.installation.categories.join(' / ') || '未分类'}</dd></div>
            <div><dt>插件来源</dt><dd>{selectedSource ? <a href={selectedSource} target="_blank" rel="noopener noreferrer" aria-label="查看源码">{selectedSourceHost === 'github.com' ? 'GitHub' : selectedSourceHost}<ExternalLink size={12} aria-hidden /></a> : '企业目录'}</dd></div>
          </dl>
          {selectedItem && selectedItem.pluginVersionId !== available.get(selected ?? '')?.pluginVersionId ? <p className="own-market-detail-message" role="status">可用版本已变化，请关闭详情后重新选择。</p> : null}
          {selectedInstalling ? <div className="own-market-detail-feedback" role="status"><StateDot state="ongoing" size={14} /><span>正在安装中…</span></div>
            : selectedRemoving ? <div className="own-market-detail-feedback" role="status"><StateDot state="ongoing" size={14} /><span>正在卸载中…</span></div>
            : selectedError ? <div className="own-market-detail-feedback" role="alert"><StateDot state="error" size={14} /><span>{errorMessage(selectedError)}</span></div>
            : selectedWaiting ? <div className="own-market-detail-feedback" role="status"><StateDot state="done" size={14} /><div>
              {selectedLocal?.desiredState === 'INSTALLED' ? '安装完成，重启客户端后生效。' : '插件变更已保存，重启客户端后生效。'}
              <small>请完全退出并重新打开客户端。</small>
            </div></div> : null}
        </div>
        {selected === undefined ? null : actions(selected)}
      </div>
    </Modal>
  </section>
}
