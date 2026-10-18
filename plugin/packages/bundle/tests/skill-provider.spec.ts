/**
 * [INPUT]: 依赖真实 Cordis、官方 skill registry/filesystem provider 和临时 DSH_HOME
 * [OUTPUT]: 验证 OwnDsh provider 只挂载 enterprise/skills、能与 standard/ptc 官方 preset filesystem provider 共存并按 scope 裁决同名 skill，且变更由官方 watcher 失效
 * [POS]: bundle D1 skill provider 接缝回归；不覆盖 upstream 四种调用策略门禁
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import { afterEach, describe, expect, it } from 'vitest'
import { mountEnterpriseSkillProvider } from '../src/skill-provider.js'

describe('enterprise skill provider', () => {
  const homes: string[] = []

  afterEach(async () => {
    await Promise.all(homes.splice(0).map(path => rm(path, { force: true, recursive: true })))
  })

  it('mounts only the OwnDsh root and observes atomic replacements', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'enterprise-provider-'))
    homes.push(dshHome)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = dshHome
    const ctx = new Context()
    try {
      const invalidate = mountEnterpriseSkillProvider(ctx)
      const root = join(dshHome, 'enterprise', 'skills', 'local')
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'SKILL.md'), '---\nname: local\ndescription: before\n---\n\nbefore\n')
      await mkdir(join(dshHome, 'skills', 'external'), { recursive: true })
      await writeFile(join(dshHome, 'skills', 'external', 'SKILL.md'), '---\nname: external\ndescription: external\n---\n')

      await expect(ctx.skills.list({ cwd: dshHome })).resolves.toMatchObject([{ name: 'local', source: 'custom', provider: 'owndsh' }])
      await rm(root, { recursive: true })
      invalidate()
      await new Promise<void>(resolve => setImmediate(resolve))
      await expect(ctx.skills.list({ cwd: dshHome })).resolves.toEqual([])
      await expect(ctx.skills.get('local', { cwd: dshHome })).resolves.toBeUndefined()

      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'SKILL.md'), '---\nname: local\ndescription: before\n---\n\nbefore\n')
      const next = join(root, '.SKILL.md.next')
      await writeFile(next, '---\nname: local\ndescription: after\n---\n\nafter\n')
      await rm(join(root, 'SKILL.md'))
      await writeFile(join(root, 'SKILL.md'), await readFile(next))
      await rm(next)
      invalidate()
      await new Promise<void>(resolve => setImmediate(resolve))
      await expect(ctx.skills.list({ cwd: dshHome })).resolves.toMatchObject([{ name: 'local', description: 'after' }])
      await expect(ctx.skills.get('local', { cwd: dshHome })).resolves.toMatchObject({ description: 'after' })
      await mkdir(join(dshHome, 'enterprise'), { recursive: true })
      await writeFile(join(dshHome, 'enterprise', 'skill-manifest.json'), '{"version":1,"skills":{"local":{"enabled":false}}}\n')
      invalidate()
      await new Promise<void>(resolve => setImmediate(resolve))
      await expect(ctx.skills.list({ cwd: dshHome })).resolves.toEqual([])
    } finally {
      await ctx.fiber.dispose()
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

  it('keeps official project and user skills visible in every Desktop preset scope', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'enterprise-provider-coexist-'))
    homes.push(dshHome)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = dshHome
    const project = join(dshHome, 'workspace')
    const agentsHome = join(dshHome, 'agents')
    const writeSkill = async (root: string, name: string, description: string): Promise<void> => {
      const directory = join(root, name)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${description}\n`)
    }
    const ctx = new Context()
    try {
      await mkdir(join(project, '.git'), { recursive: true })
      await writeSkill(join(project, '.dsh', 'skills'), 'project-skill', 'project')
      await writeSkill(join(project, '.dsh', 'skills'), 'shared-skill', 'project wins the same-name conflict')
      await writeSkill(join(dshHome, 'skills'), 'user-skill', 'user')
      await writeSkill(join(dshHome, 'enterprise', 'skills'), 'own-skill', 'own')
      await writeSkill(join(dshHome, 'enterprise', 'skills'), 'shared-skill', 'own loses to the preset layer')

      mountEnterpriseSkillProvider(ctx)
      for (const presetId of ['standard', 'ptc']) {
        const preset = createScope(ctx, { preset: presetId })
        try {
          await preset.ctx.plugin(SkillFileSystem, {
            providerName: 'filesystem',
            includeDefaultRoots: true,
            dshHome,
            agentsHome,
            watch: false,
          })

          await expect(ctx.skills.list({ cwd: project })).resolves.toEqual([
            expect.objectContaining({ name: 'own-skill', provider: 'owndsh', source: 'custom' }),
            expect.objectContaining({ name: 'shared-skill', provider: 'owndsh', source: 'custom' }),
          ])
          await expect(ctx.skills.list({ cwd: project, scope: scopeOf(preset.ctx) })).resolves.toEqual([
            expect.objectContaining({ name: 'own-skill', provider: 'owndsh', source: 'custom' }),
            expect.objectContaining({ name: 'project-skill', provider: 'filesystem', source: 'project-dsh' }),
            expect.objectContaining({ name: 'shared-skill', provider: 'filesystem', source: 'project-dsh', description: 'project wins the same-name conflict' }),
            expect.objectContaining({ name: 'user-skill', provider: 'filesystem', source: 'user-dsh' }),
          ])
        } finally {
          await preset.dispose()
        }
      }
    } finally {
      await ctx.fiber.dispose()
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

})
