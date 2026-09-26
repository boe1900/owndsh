/**
 * [INPUT]: 依赖 官方 sidebar slot 与 primitives 图标
 * [OUTPUT]: 对外提供 PluginsPanelIcon
 * [POS]: 官方插件管理页侧栏图标
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** The sidebar's Plugins entry icon; the sidebar owns the button, label, and selected state around it. */

import type { ReactNode } from 'react'
import { IconPluginPinwheelOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the plugin glyph at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns the icon element.
 */
export function PluginsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconPluginPinwheelOutlineRegular size={size} />
}
