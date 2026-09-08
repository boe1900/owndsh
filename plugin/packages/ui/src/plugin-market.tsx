/**
 * [INPUT]: 依赖共享 EnterpriseAccountStore 的企业目录/本机事实、Harness Modal/Button 与 Lucide 图标
 * [OUTPUT]: 提供设置页内的插件搜索/已安装筛选、版本详情、显式安装/卸载及状态文案
 * [POS]: ui 的员工插件管理视图，由 OwnDsh 设置的插件 tab 承载，数据与执行由 OwnDsh Host 拥有
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { Check, Download, Package, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { EnterpriseAccountStore } from './account-store.js'
import { ConfirmAction } from './confirm-action.js'
import type { ManagedPluginState } from './local-api.js'

const STATES: Record<ManagedPluginState, { title: string; description: string; color: string }> = {
  EXPECTED: { title: '未安装', description: '可选择安装', color: '#667085' },
  DOWNLOAD_PENDING: { title: '等待下载', description: '制品下载即将开始', color: '#2563eb' },
  DOWNLOADING: { title: '正在下载', description: '正在获取企业插件', color: '#2563eb' },
  VERIFIED: { title: '校验通过', description: '制品签名与兼容性有效', color: '#2563eb' },
  INSTALLING: { title: '正在安装', description: '正在更新本机插件', color: '#2563eb' },
  RESTART_REQUIRED: { title: '等待重启', description: '重启 Harness 后生效', color: '#b54708' },
  ACTIVE: { title: '已安装', description: '插件已启用', color: '#16803c' },
  REMOVE_PENDING: { title: '等待卸载', description: '卸载操作即将开始', color: '#b54708' },
  REMOVING: { title: '正在卸载', description: '正在更新本机插件', color: '#b54708' },
  FAILED: { title: '处理失败', description: '请重试', color: '#c4320a' },
  ROLLBACK: { title: '切换版本', description: '正在安装所选版本', color: '#2563eb' },
}

export const enterprisePluginStatePresentation = (state: ManagedPluginState) => STATES[state]

const ERRORS: Record<string, string> = {
  ENT_PLUGIN_SIGNATURE_INVALID: '企业插件信任配置不可用，请联系管理员',
  ENT_PLUGIN_INCOMPATIBLE: '与当前客户端不兼容',
  ENT_PERMISSION_DENIED: '插件已下架或可见范围已变更，请刷新',
  ENT_PLUGIN_BUSY: '另一项插件操作正在进行',
  ENT_PLUGIN_HASH_MISMATCH: '插件文件校验失败，请重试',
  ENT_PLUGIN_CLI_FAILED: '插件安装工具执行失败，请重试',
  ENT_PLUGIN_LOADER_INACTIVE: '插件未能启动，请重试或卸载',
  ENT_AUTH_REQUIRED: '请先登录企业账号',
}
const OS: Record<string, string> = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }
const bytes = (value: number) => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`
const errorMessage = (code: string) => ERRORS[code] ?? `插件操作失败 (${code})`

const styles = `
.own-market{color:var(--dsw-alias-label-primary,#101828);font-size:13px;letter-spacing:0;min-width:0}
.own-market *{box-sizing:border-box}
.own-market-toolbar,.own-market-tabs,.own-market-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.own-market-tabs{border-bottom:1px solid var(--dsw-alias-stroke-border-2,#e4e7ec);gap:20px;margin-bottom:18px}
.own-market-tabs button{color:var(--dsw-alias-label-secondary,#475467);font:inherit;border:0;border-bottom:2px solid transparent;background:none;padding:10px 0;cursor:pointer}
.own-market-tabs button[aria-pressed=true]{color:var(--dsw-alias-label-primary,#101828);border-bottom-color:var(--dsw-alias-accent-primary,#2563eb)}
.own-market-toolbar{margin-bottom:18px}.own-market-search{display:flex;align-items:center;gap:8px;flex:1;min-width:140px;border:1px solid var(--dsw-alias-stroke-border-2,#d0d5dd);border-radius:6px;padding:0 10px;height:36px}
.own-market-search input{width:100%;min-width:0;border:0;background:none;color:inherit;font:inherit;outline:none}.own-market-search:focus-within{outline:2px solid var(--dsw-alias-accent-primary,#2563eb);outline-offset:2px}
.own-market-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:12px}
.own-market-card{display:flex;flex-direction:column;gap:14px;min-width:0;padding:16px;border:1px solid var(--dsw-alias-stroke-border-2,#e4e7ec);border-radius:8px;background:var(--dsw-alias-background-primary,transparent)}
.own-market-card:focus-within,.own-market-card:hover{border-color:var(--dsw-alias-accent-primary,#2563eb)}
.own-market-title{display:flex;align-items:flex-start;gap:10px;color:inherit;text-align:left;border:0;padding:0;background:none;cursor:pointer;font:inherit;min-width:0;width:100%}
.own-market-glyph{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border-radius:6px;background:var(--dsw-alias-background-secondary,#f2f4f7);color:var(--dsw-alias-label-secondary,#475467)}
.own-market-title strong{display:block;font-size:14px;line-height:21px;overflow-wrap:anywhere}.own-market-sub{color:var(--dsw-alias-label-secondary,#667085);font-size:12px;line-height:19px;overflow-wrap:anywhere}
.own-market-card footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:auto;min-height:30px}
.own-market-empty{text-align:center;padding:44px 12px;color:var(--dsw-alias-label-secondary,#667085)}
.own-market-notice{padding:10px 0;line-height:20px;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary,#667085)}
.own-market-error{color:var(--dsw-alias-state-error-primary,#c4320a)}
.own-market-facts{display:grid;grid-template-columns:minmax(70px,auto) minmax(0,1fr);gap:12px 20px;font-size:13px;margin:0}.own-market-facts dt{color:var(--dsw-alias-label-secondary,#667085)}.own-market-facts dd{margin:0;overflow-wrap:anywhere}
`

export function EnterprisePluginMarket({ store }: {
  readonly store: EnterpriseAccountStore
}): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [view, setView] = useState<'all' | 'installed'>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>()
  const details = useRef<HTMLDListElement>(null)
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
      const buttons = root.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
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
  const catalog = connected ? status?.catalog ?? [] : []
  const local = new Map((connected ? status?.plugins ?? [] : []).map(item => [item.packageName, item]))
  const available = new Map(catalog.map(item => [item.packageName, item]))
  const names = [...new Set([...available.keys(), ...local.keys()])]
  const installed = (name: string) => local.get(name)?.desiredState === 'INSTALLED' && local.get(name)?.version != null
  const rows = names.filter(name => (view === 'all' || installed(name)) && name.toLowerCase().includes(query.trim().toLowerCase()))
  const busy = snapshot.pluginBusy !== undefined || snapshot.busy !== undefined
  const fatal = status?.fatalErrorCode
  const selectedItem = selected === undefined ? undefined : available.get(selected)
  const selectedLocal = selected === undefined ? undefined : local.get(selected)
  const restartRequired = [...local.values()].some(item => item.state === 'RESTART_REQUIRED')
  const actions = (name: string) => {
    const item = available.get(name)
    const record = local.get(name)
    const waiting = record?.state === 'RESTART_REQUIRED'
    const sameVersion = record?.desiredState === 'INSTALLED' && record.version === item?.version && record.state === 'ACTIVE'
    return <div className="own-market-actions">
      {item && !sameVersion ? <Button size="sm" variant="outline"
        disabled={busy || !connected || fatal !== undefined || item.installErrorCode !== undefined || waiting}
        icon={<Download size={14} aria-hidden />}
        onClick={() => { void store.installPlugin(name, item.pluginVersionId) }}>
        {snapshot.pluginBusy?.packageName === name && snapshot.pluginBusy.action === 'install' ? '正在安装' : record?.state === 'FAILED' ? '重试' : installed(name) ? '更新版本' : '安装'}
      </Button> : sameVersion ? <span style={{ color: '#16803c', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} aria-hidden />已安装</span> : null}
      {record?.version != null && (record.desiredState === 'INSTALLED' || record.state === 'FAILED') ? <ConfirmAction
        title="卸载企业插件" description={name} confirmLabel="确认卸载" disabled={busy || !connected || fatal !== undefined || waiting}
        onConfirm={() => { setSelected(undefined); void store.removePlugin(name) }}>
        {open => <Button size="sm" variant="ghost" aria-label={`卸载 ${name}`} title="卸载" disabled={busy || !connected || fatal !== undefined || waiting}
          icon={<Trash2 size={14} aria-hidden />} onClick={open} />}
      </ConfirmAction> : null}
    </div>
  }

  return <section className="own-market" aria-label="企业插件市场">
    <style>{styles}</style>
    <div className="own-market-tabs" role="group" aria-label="插件视图">
      <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>全部插件</button>
      <button type="button" aria-pressed={view === 'installed'} onClick={() => setView('installed')}>已安装 ({names.filter(installed).length})</button>
      <span className="own-market-sub" style={{ marginLeft: 'auto' }}>{catalog.length} 个可用插件</span>
    </div>
    <div className="own-market-toolbar">
      <label className="own-market-search"><Search size={16} aria-hidden /><input type="search" aria-label="搜索企业插件" placeholder="搜索企业插件" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <Button size="sm" variant="ghost" aria-label="刷新插件" title="刷新插件" disabled={!connected || snapshot.pluginsLoading || busy}
        icon={<RefreshCw size={16} aria-hidden />} onClick={() => { void store.refreshPlugins() }} />
    </div>
    {restartRequired ? <div className="own-market-notice" role="status">插件变更已保存，完全退出并重新打开客户端后生效。</div> : null}
    {snapshot.pluginErrorCode || fatal ? <div className="own-market-notice own-market-error" role="alert">{errorMessage(snapshot.pluginErrorCode ?? fatal!)}</div> : null}
    {status?.lastReportErrorCode ? <div className="own-market-notice" role="status">设备状态暂未上报</div> : null}
    {!connected ? <div className="own-market-empty">登录企业账号后可用</div> : snapshot.pluginsLoading && !status ? <div className="own-market-empty" role="status">正在加载插件</div> : rows.length === 0 ? <div className="own-market-empty">{query ? '没有匹配的插件' : view === 'installed' ? '尚未安装企业插件' : '暂无可用企业插件'}</div> : null}
    <div className="own-market-grid">
      {rows.map(name => {
        const item = available.get(name)
        const record = local.get(name)
        const presentation = record ? STATES[record.state] : undefined
        return <article className="own-market-card" key={name} data-enterprise-plugin-package={name} data-enterprise-plugin-state={record?.state ?? 'AVAILABLE'}>
          <button type="button" className="own-market-title" aria-haspopup="dialog" onClick={() => setSelected(name)}>
            <span className="own-market-glyph"><Package size={20} aria-hidden /></span>
            <span style={{ minWidth: 0 }}><strong>{name}</strong><span className="own-market-sub">企业发布 · v{item?.version ?? record?.version}</span></span>
          </button>
          <div className="own-market-sub">{item ? `${item.operatingSystems.map(os => OS[os]).join(' / ')} · ${bytes(item.sizeBytes)}` : '已不在企业目录中'}</div>
          {item?.installErrorCode ? <div className="own-market-sub">{errorMessage(item.installErrorCode)}</div> : null}
          {record?.lastErrorCode ? <div className="own-market-sub own-market-error">{errorMessage(record.lastErrorCode)}</div> : null}
          <footer><span style={{ color: presentation?.color ?? 'var(--dsw-alias-label-secondary,#667085)' }}>{presentation?.title ?? '可选安装'}</span>{actions(name)}</footer>
        </article>
      })}
    </div>
    <Modal open={connected && selected !== undefined} onClose={() => setSelected(undefined)} closeLabel="关闭" title="插件详情"
      footer={selected === undefined ? null : actions(selected)}>
      <dl ref={details} className="own-market-facts">
        <dt>插件</dt><dd>{selected}</dd>
        <dt>企业版本</dt><dd>{selectedItem?.version ?? '已下架'}</dd>
        <dt>本机版本</dt><dd>{selectedLocal?.desiredState === 'INSTALLED' ? selectedLocal.version : '未安装'}</dd>
        <dt>发布方</dt><dd>企业管理员</dd>
        {selectedItem ? <><dt>系统</dt><dd>{selectedItem.operatingSystems.map(os => OS[os]).join(' / ')}</dd><dt>大小</dt><dd>{bytes(selectedItem.sizeBytes)}</dd></> : null}
        {selectedItem?.installErrorCode ? <><dt>安装状态</dt><dd>{errorMessage(selectedItem.installErrorCode)}</dd></> : null}
      </dl>
    </Modal>
  </section>
}
