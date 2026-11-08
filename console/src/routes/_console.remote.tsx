/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与 RemotePage。
 * [OUTPUT]: 提供远程连接产品路由入口。
 * [POS]: _console 的 Remote 管控台薄入口，连接状态与 API 由 features/remote 独占。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router'
import { RemotePage } from '@/features/remote/remote-page'

export const Route = createFileRoute('/_console/remote')({
  component: RemotePage
})
