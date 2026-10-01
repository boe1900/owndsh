/**
 * [INPUT]: 依赖 React、OwnDsh ConfigForm、MCP assignment 的有效曝光值与 Pi 四档配置语义
 * [OUTPUT]: 提供 MCP 曝光配置快照订阅、服务器/工具 preference 解码和选择控件
 * [POS]: dsh-ui 的 MCP 偏好呈现子模块，被 account-view 的 MCP tab 消费；不处理连接、授权或工具执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { EnterpriseConfigForm } from './account-view.js'
import type { McpExposure } from './local-api.js'

interface EnterpriseConfigFormSnapshot {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: unknown
  readonly revision?: number
  readonly writable: boolean
}

export interface McpServerPreference {
  readonly exposure?: McpExposure
  readonly toolExposure?: Readonly<Record<string, McpExposure>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isMcpExposure(value: unknown): value is McpExposure {
  return value === 'codemode' || value === 'deferred' || value === 'direct' || value === 'hidden'
}

function normalizedMcpExposure(value: unknown): McpExposure | undefined {
  return isMcpExposure(value) ? value : value === 'codemode-deferred' ? 'codemode' : undefined
}

export function readMcpServerPreference(value: unknown, serverName: string): McpServerPreference {
  if (!isRecord(value) || !isRecord(value.mcp) || !isRecord(value.mcp.servers)) return {}
  const server = value.mcp.servers[serverName]
  if (!isRecord(server)) return {}
  const toolExposure = isRecord(server.toolExposure)
    ? Object.fromEntries(Object.entries(server.toolExposure).flatMap(([name, exposure]) => {
      const normalized = normalizedMcpExposure(exposure)
      return normalized === undefined ? [] : [[name, normalized]]
    })) as Record<string, McpExposure>
    : undefined
  const exposure = normalizedMcpExposure(server.exposure)
  return {
    ...(exposure === undefined ? {} : { exposure }),
    ...(toolExposure === undefined ? {} : { toolExposure }),
  }
}

export function useConfigFormSnapshot(form: EnterpriseConfigForm): EnterpriseConfigFormSnapshot {
  const subscribe = useMemo(() => (listener: () => void) => form.subscribe(listener), [form])
  const getSnapshot = useMemo(() => () => form.getSnapshot(), [form])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const EXPOSURE_OPTIONS: readonly { readonly value: McpExposure; readonly label: string }[] = [
  { value: 'deferred', label: 'deferred：检索后声明' },
  { value: 'codemode', label: 'codemode：代码调用' },
  { value: 'direct', label: 'direct：直接声明' },
  { value: 'hidden', label: 'hidden：隐藏' },
]

export function ExposureSelect(props: {
  readonly label: string
  readonly value?: McpExposure | undefined
  readonly placeholder: string
  readonly disabled: boolean
  readonly busy: boolean
  readonly onChange: (value: McpExposure | undefined) => void
}): ReactNode {
  return <label style={{ alignItems: 'center', display: 'inline-flex', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary, #475467)' }}>
    <span>{props.label}</span>
    <select aria-label={props.label} value={props.value ?? ''} disabled={props.disabled || props.busy}
      onChange={event => props.onChange(event.target.value === '' ? undefined : event.target.value as McpExposure)}
      style={{ border: '1px solid var(--dsw-alias-border-l2, #e4e7ec)', borderRadius: 6, color: 'inherit', font: 'inherit', padding: '4px 7px', maxWidth: 220 }}>
      <option value="">{props.placeholder}</option>
      {EXPOSURE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
}

export function McpToolDetails(props: {
  readonly name: string
  readonly description: string
  readonly exposure?: McpExposure | undefined
  readonly effectiveExposure?: McpExposure | undefined
  readonly disabled: boolean
  readonly busy: boolean
  readonly onExposureChange: (value: McpExposure | undefined) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const previewRef = useRef<HTMLSpanElement>(null)
  const expandable = props.description.length > 240 || overflow
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [props.description, open, expandable])
  // 预览限制进入 DOM 的文本量，原始描述只在用户展开时渲染。
  const excerpt = props.description.slice(0, 240).replace(/\s+/g, ' ').trim()
  const preview = excerpt ? `${excerpt}${props.description.length > 240 ? '…' : ''}` : '暂无简介'
  const textStyle: CSSProperties = { margin: '4px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #667085)' }
  const rowStyle: CSSProperties = { padding: '10px 0', borderBottom: '1px solid var(--dsw-alias-border-l2, #e4e7ec)', overflowWrap: 'anywhere' }
  const previewNode = <span ref={previewRef} style={{ ...textStyle, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden', fontWeight: 400 }}>{preview}</span>
  const exposure = <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
    <ExposureSelect label="工具曝光" value={props.exposure} placeholder="跟随服务器" disabled={props.disabled} busy={props.busy} onChange={props.onExposureChange} />
    <span style={{ color: 'var(--dsw-alias-label-tertiary, #667085)', fontSize: 11 }}>当前：{props.effectiveExposure ?? 'deferred'}</span>
  </div>
  if (!expandable) return <div style={rowStyle}><div style={{ fontSize: 12, fontWeight: 500 }}>{props.name}</div>{previewNode}{exposure}</div>
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} style={rowStyle}>
    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
      {props.name}
      {!open ? previewNode : null}
    </summary>
    {open ? <p style={{ ...textStyle, whiteSpace: 'pre-wrap' }}>{props.description || '暂无简介'}</p> : null}
    {exposure}
  </details>
}
