/**
 * [INPUT]: 依赖原生 WorkspaceRegistry 的可信目录和公开 mux 协议。
 * [OUTPUT]: 提供逐端点准入与按原生物理路径语义的 realpath 约束，拒绝安装/凭据/本机设置及写文件旁路。
 * [POS]: remote Host 的业务权限边界；agent/terminal 仍以原生 DSH 的 OS 用户执行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

export interface WorkspaceCatalog {
  list(): readonly { readonly id: string; readonly path: string; readonly sessionIds: readonly string[] }[]
}
export const DSH_UNARY_ENDPOINTS = new Set([
  '$events/result',
  'session/list', 'session/search', 'session/create', 'session/selectModel', 'session/modelCatalog',
  'session/rename', 'session/fork', 'session/prompt', 'session/attachment', 'session/updateQueue',
  'session/cancel', 'session/page', 'session/projections',
  'workspace/rename', 'workspace/insertBefore', 'workspace/insertSessionBefore',
  'workspace/archiveSession', 'workspace/unarchiveSession', 'workspace/pinSession', 'workspace/unpinSession',
  'workspaceFiles/read', 'workspaceFiles/readBytes', 'workspaceFiles/stat', 'workspaceFiles/list',
  'terminal/environment', 'terminal/shells', 'terminal/list', 'terminal/create', 'terminal/rename', 'terminal/close',
  'commands/list', 'commands/execute', 'subagents/prompt', 'subagents/interruptByParent', 'job/kill',
  'agentPresets/list', 'agentPresets/read', 'agentPresets/select', 'permissionPresets/catalog', 'skills/list',
])
export const DSH_STREAM_ENDPOINTS = new Set([
  '$events', 'remoteAccess/follow', 'workspace/follow', 'session/follow', 'session/control',
  'workspaceFiles/changes', 'terminal/retain', 'terminal/attach',
  'job/list', 'job/follow',
])
const filePayload = z.object({ args: z.object({ workspaceFileScopeId: z.string().min(1), path: z.string().max(8192),
  options: z.object({ baseFile: z.string().optional() }).passthrough().optional() }).passthrough() }).passthrough()

export async function authorizeFilePayload(catalog: WorkspaceCatalog, payload: unknown): Promise<void> {
  const { args } = filePayload.parse(payload)
  const workspace = catalog.list().find(value => value.sessionIds.includes(args.workspaceFileScopeId))
  if (!workspace) throw new Error('ENT_REMOTE_DENIED')
  let path = args.path
  if (args.options?.baseFile !== undefined) {
    const base = await containPath(workspace.path, args.options.baseFile)
    const relativePath = path.replaceAll('\\', '/')
    if (relativePath.startsWith('/') || /^[a-z][a-z\d+.-]*:/iu.test(relativePath)) throw new Error('ENT_REMOTE_DENIED')
    path = resolve(dirname(base), relativePath)
  }
  await containPath(workspace.path, path)
}
export async function authorizeMedia(catalog: WorkspaceCatalog, path: string): Promise<void> {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('ENT_REMOTE_DENIED')
  const target = await realpath(path)
  for (const workspace of catalog.list()) {
    if (contained(await realpath(workspace.path), target)) return
  }
  throw new Error('ENT_REMOTE_DENIED')
}
async function containPath(root: string, path: string): Promise<string> {
  if (path.includes('\0')) throw new Error('ENT_REMOTE_DENIED')
  const target = await realpath(isAbsolute(path) ? path : `${root}${sep}${path}`)
  if (!contained(await realpath(root), target)) throw new Error('ENT_REMOTE_DENIED')
  return target
}
function contained(root: string, target: string): boolean {
  const part = relative(root, target)
  return part === '' || !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`)
}
export function dshPath(path: string): URL {
  const pathname = path.split('?')[0]!
  if (!path.startsWith('/api/') || pathname.includes('\\') || path.includes('#') || /%2f|%5c|%00/i.test(pathname)) throw new Error('ENT_REMOTE_DENIED')
  const url = new URL(path, 'http://remote.invalid')
  if (url.origin !== 'http://remote.invalid' || url.pathname !== pathname) throw new Error('ENT_REMOTE_DENIED')
  return url
}
