/**
 * [INPUT]: 依赖管理员授权安装配置、Node fs/path 与宿主 profile 的实际安装清单。
 * [OUTPUT]: 校验安装目标，固定依赖键，并检查包名、版本和 DSH bundle 入口。
 * [POS]: plugin-distribution 的包身份边界；解析依赖和构建策略由宿主 pnpm 独占。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { PluginDistributionError } from './errors.js'
import type { RuntimePluginAssignment } from './types.js'

export function verifyAssignmentMetadata(assignment: RuntimePluginAssignment): void {
  const spec = assignment.installation.spec
  let allowed = spec === `${assignment.packageName}@${assignment.version}`
    || /^github:[A-Za-z0-9-]+\/[A-Za-z0-9._-]+#[0-9a-f]{40}(?:&path:\/[A-Za-z0-9_./-]+)?$/.test(spec)
      && !spec.includes('/../') && !spec.endsWith('/..')
  try {
    const url = new URL(spec)
    allowed ||= ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash && url.pathname.endsWith('.tgz')
  } catch { /* npm 与 Git spec 不必是 URL。 */ }
  if (!allowed || /[\x00-\x1f\x7f]/.test(spec)) throw new PluginDistributionError('ENT_PLUGIN_INCOMPATIBLE', 'plugin install target is invalid on this host')
}

/** 为 Git/tgz 固定依赖键，防止目标包名变化覆盖另一个宿主依赖。 */
export function installationTarget(assignment: RuntimePluginAssignment): string {
  const { spec } = assignment.installation
  if (spec === `${assignment.packageName}@${assignment.version}`) return spec
  return `${assignment.packageName}@${spec}`
}
