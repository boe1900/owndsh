/**
 * [INPUT]: 依赖官方 dsh-skill registry/filesystem provider 和 OwnDsh 固定 DSH_HOME 解析
 * [OUTPUT]: 将 OwnDsh 全局 skill 根目录挂载为官方 filesystem provider 的隔离委托，并按设备 manifest 过滤 disabled skill
 * [POS]: bundle 的 skill 运行时接缝；parser、rank、watcher 和目录扫描全部交给官方 provider，只保留最小 Effective 过滤
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import type { SkillCandidate, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { resolveEnterpriseDshHome, resolveEnterpriseSkillManifestPath, resolveEnterpriseSkillRoot } from '@owndsh/platform-client'

/** 挂载唯一 OwnDsh 全局根；其他 DSH root 由官方 provider 保持在本接缝之外。 */
export function mountEnterpriseSkillProvider(ctx: Context): () => void {
  if (ctx.get('skills') === undefined) ctx.plugin(SkillRegistry)
  const dshHome = resolveEnterpriseDshHome()
  let skillsRef: SkillRegistry | undefined
  let dispose: (() => void) | undefined
  const register = (skills: SkillRegistry): void => { dispose = skills.registerProvider((control: SkillProviderControl): SkillProvider => {
    const delegate = new SkillFileSystem.FileSystemSkillProvider(ctx, control, {
      providerName: 'owndsh',
      includeDefaultRoots: false,
      dshHome,
      agentsHome: join(homedir(), '.agents'),
      customSkillDirs: [resolveEnterpriseSkillRoot({ dshHome })],
      watch: true,
    })
    const disabled = async (): Promise<Set<string>> => {
      try {
        const parsed = JSON.parse(await readFile(resolveEnterpriseSkillManifestPath({ dshHome }), 'utf8')) as { version?: unknown; skills?: Record<string, { enabled?: unknown }> }
        if (parsed.version !== 1 || parsed.skills === undefined) return new Set()
        return new Set(Object.entries(parsed.skills).filter(([, entry]) => entry?.enabled === false).map(([name]) => name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set()
        throw error
      }
    }
    return {
      name: 'owndsh',
      list: async (options: SkillLookupOptions) => {
        const names = await disabled()
        const result = await delegate.list(options)
        const candidates = Array.isArray(result) ? result : result.candidates
        const filtered = candidates.filter(candidate => !names.has(candidate.name))
        return Array.isArray(result) ? filtered : { ...result, candidates: filtered }
      },
      get: async (candidate: SkillCandidate, options: SkillLookupOptions) => {
        const names = await disabled()
        if (names.has(candidate.name)) return undefined
        return delegate.get(candidate, options)
      },
    }
  }) }
  ctx.inject(['skills'], ({ skills }) => { skillsRef = skills; register(skills) })
  return () => {
    dispose?.()
    dispose = undefined
    if (skillsRef !== undefined) register(skillsRef)
  }
}
