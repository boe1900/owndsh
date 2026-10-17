/**
 * [INPUT]: 依赖本地已安装/可安装 skill 清单、设备级启用/安装/卸载动作、Host 文件/会话接缝与官方 UI primitives
 * [OUTPUT]: 提供 OwnDsh 技能可安装/已安装筛选、搜索、图标卡片、启用开关和 WorkBuddy 风格操作菜单
 * [POS]: dsh-ui 的技能 tab；只消费 Host 投影，不解析 SKILL.md、不拼接本地路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  Download,
  FilePenLine,
  FolderOpen,
  MoreHorizontal,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ConfirmAction } from './confirm-action.js'
import type { EnterpriseInstalledSkill } from './local-api.js'
import { EnterpriseSkillStore } from './skill-store.js'
import css from './skill-market.module.css'

export interface EnterpriseSkillMarketProps {
  readonly store: EnterpriseSkillStore
  readonly active: boolean
}

function messageFor(code: string | undefined): string | undefined {
  if (code === undefined) return undefined
  if (code === 'ENT_SKILL_NOT_FOUND') return '技能已被移除，请刷新。'
  if (code === 'ENT_LOCAL_UNAVAILABLE') return '本地 Harness 暂不可用。'
  return `操作失败，请重试（${code}）`
}

function iconUrl(skill: EnterpriseInstalledSkill): string {
  return `/enterprise/api/v1/local/skill-icons/${encodeURIComponent(skill.name)}`
}

function SkillArtwork({ skill }: { readonly skill: EnterpriseInstalledSkill }): ReactNode {
  const [failed, setFailed] = useState(false)
  return skill.hasIcon && !failed
    ? <img className={css.iconImage} src={iconUrl(skill)} alt="" onError={() => setFailed(true)} />
    : <Sparkles aria-hidden size={24} />
}

function SkillCard({ skill, store }: { readonly skill: EnterpriseInstalledSkill; readonly store: EnterpriseSkillStore }): ReactNode {
  const snapshot = store.getSnapshot()
  const busy = snapshot.busy !== undefined
  const disabled = busy || !skill.enabled
  const actions = skill.actions ?? { file: false, directory: false }
  const [menuOpen, setMenuOpen] = useState(false)
  let openRemove: (() => void) | undefined
  const run = (target: 'file' | 'directory'): void => {
    setMenuOpen(false)
    void store.open(skill.name, target)
  }
  return <article className={css.card} data-skill-name={skill.name}>
    <div className={css.cardTop}>
      <div className={css.icon} aria-hidden="true"><SkillArtwork skill={skill} /></div>
      <div className={css.cardTitle}>
        <strong title={skill.displayName}>{skill.displayName}</strong>
        <span className={css.name}>{skill.name}</span>
      </div>
      <Menu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        align="end"
        portal
        anchor={<button className={css.more} type="button" aria-label={`打开 ${skill.displayName} 操作菜单`} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreHorizontal aria-hidden size={18} /></button>}
        items={[
          { id: 'file', label: '编辑', icon: <FilePenLine size={15} />, disabled: !actions.file || busy },
          { id: 'directory', label: '打开文件夹', icon: <FolderOpen size={15} />, disabled: !actions.directory || busy },
          { type: 'separator', id: 'remove-separator' },
          { id: 'remove', label: '卸载', icon: <Trash2 size={15} />, danger: true, disabled: busy },
        ]}
        onSelect={id => {
          if (id === 'file') run('file')
          else if (id === 'directory') run('directory')
          else if (id === 'remove') { setMenuOpen(false); openRemove?.() }
        }}
      />
    </div>
    <p className={css.description}>{skill.description || '暂无描述'}</p>
    <div className={css.cardBottom}>
      <div className={css.tags}>
        {skill.category ? <span className={css.tag}>{skill.category}</span> : null}
        <span className={css.tag}>v{skill.version}</span>
        {!skill.userInvocable ? <span className={css.mutedTag}>仅自动调用</span> : null}
      </div>
      <Switch checked={skill.enabled} disabled={busy} label={`${skill.enabled ? '禁用' : '启用'} ${skill.displayName}`} onChange={value => { void store.setEnabled(skill.name, value) }} />
    </div>
    <ConfirmAction title="卸载技能" description={`确定卸载“${skill.displayName}”吗？本地副本会被删除。`} confirmLabel="确认卸载" disabled={busy} onConfirm={() => { void store.remove(skill.name) }}>
      {openConfirm => { openRemove = openConfirm; return null }}
    </ConfirmAction>
  </article>
}

function AvailableSkillCard({ name, store }: { readonly name: string; readonly store: EnterpriseSkillStore }): ReactNode {
  const skill = store.getSnapshot().availableSkills.find(item => item.name === name)
  if (skill === undefined) return null
  const busy = store.getSnapshot().busy !== undefined
  return <article className={css.card} data-skill-name={skill.name}>
    <div className={css.cardTop}>
      <div className={css.icon} aria-hidden="true"><Sparkles aria-hidden size={24} /></div>
      <div className={css.cardTitle}>
        <strong title={skill.displayName}>{skill.displayName}</strong>
        <span className={css.name}>{skill.name}</span>
      </div>
    </div>
    <p className={css.description}>{skill.description || '暂无描述'}</p>
    <div className={css.cardBottom}>
      <div className={css.tags}>
        {skill.category ? <span className={css.tag}>{skill.category}</span> : null}
        <span className={css.tag}>v{skill.version}</span>
        {!skill.userInvocable ? <span className={css.mutedTag}>仅自动调用</span> : null}
      </div>
      <Button size="sm" variant="outline" icon={<Download aria-hidden size={14} />} disabled={busy} onClick={() => { void store.install(skill.name) }}>安装</Button>
    </div>
  </article>
}

export function EnterpriseSkillMarket({ store, active }: EnterpriseSkillMarketProps): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'available' | 'installed'>('installed')
  useEffect(() => { if (active) void store.refresh() }, [active, store])
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const source = view === 'installed' ? snapshot.skills : snapshot.availableSkills
    return source.filter(skill => !needle || [skill.name, skill.displayName, skill.description, skill.category ?? ''].join(' ').toLowerCase().includes(needle))
  }, [query, snapshot.availableSkills, snapshot.skills, view])
  const notice = messageFor(snapshot.errorCode)
  return <section className={css.market} aria-label="OwnDsh 技能">
    <div className={css.viewTabs} role="tablist" aria-label="技能视图">
      <button type="button" role="tab" aria-selected={view === 'available'} className={view === 'available' ? css.viewTabActive : css.viewTab} onClick={() => setView('available')}>可安装</button>
      <button type="button" role="tab" aria-selected={view === 'installed'} className={view === 'installed' ? css.viewTabActive : css.viewTab} onClick={() => setView('installed')}>已安装</button>
    </div>
    <div className={css.toolbar}>
      <label className={css.search}>
        <Search aria-hidden size={16} />
        <input type="search" aria-label="搜索技能" placeholder="搜索技能名称或描述" value={query} onChange={event => setQuery(event.currentTarget.value)} />
      </label>
      <Button size="sm" variant="outline" disabled={snapshot.busy !== undefined} onClick={() => { void store.refresh() }}>刷新</Button>
    </div>
    {notice ? <p className={css.notice} role="alert">{notice}</p> : null}
    {snapshot.phase === 'loading' && snapshot.skills.length === 0 && snapshot.availableSkills.length === 0 ? <p className={css.empty}>正在读取技能…</p>
      : rows.length === 0 ? <p className={css.empty}>{query ? '暂无匹配的技能。' : view === 'installed' ? '还没有安装 OwnDsh 技能。' : '暂无可安装的技能。'}</p>
        : <div className={css.grid}>{rows.map(skill => view === 'installed'
          ? <SkillCard key={skill.name} skill={skill as EnterpriseInstalledSkill} store={store} />
          : <AvailableSkillCard key={skill.name} name={skill.name} store={store} />)}</div>}
  </section>
}
