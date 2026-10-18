/**
 * [INPUT]: dsh-v0.2.1-rc.2 checkout，临时 DSH_HOME 和四组 WorkBuddy frontmatter。
 * [OUTPUT]: 验证 OwnDsh 专用 customSkillDirs 的隔离、Desktop 双 provider 组成、watcher 失效和四种调用策略。
 * [POS]: plugin/scripts 的 DSH skill 兼容门禁；不进入产品运行时，也不实现 custom provider。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const EXPECTED_COMMIT = '687f282e8625c6b8d11ff58211a90524be2e4317'
const EXPECTED_VERSION = '0.2.1-rc.2'
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const harnessRoot = resolve(process.argv[2] ?? process.env.OWNDSH_SKILL_HARNESS_ROOT ?? join(PROJECT_ROOT, '..', 'deepseek-harness'))
const desktopHarnessRoot = resolve(process.argv[3] ?? process.env.OWNDSH_DESKTOP_HARNESS_ROOT ?? join(PROJECT_ROOT, '..', 'owndsh-desktop', '.build', 'official-harness'))
const skillRequire = createRequire(pathToFileURL(join(harnessRoot, 'packages/skill/skill/package.json')))
const filesystemRequire = createRequire(pathToFileURL(join(harnessRoot, 'packages/skill/skill-filesystem/package.json')))

function harnessModulePath(name: string, resolver: NodeRequire): string {
  try {
    return resolver.resolve(name)
  } catch {
    return createRequire(pathToFileURL(join(harnessRoot, 'package.json'))).resolve(name)
  }
}

const { Context } = await import(pathToFileURL(harnessModulePath('@deepseek-ai/cordis', skillRequire)).href)
const { default: SkillRegistry } = await import(pathToFileURL(harnessModulePath('@deepseek-ai/dsh-skill', skillRequire)).href)
const SkillFileSystem = await import(pathToFileURL(harnessModulePath('@deepseek-ai/dsh-skill-filesystem', filesystemRequire)).href)
const { createScope, scopeOf } = await import(pathToFileURL(harnessModulePath('@deepseek-ai/dsh-scope', skillRequire)).href)

function git(...args: string[]): string {
  return execFileSync('git', ['-C', harnessRoot, ...args], { encoding: 'utf8' }).trim()
}

async function writeSkill(root: string, name: string, extra = '', body = name, description = name): Promise<void> {
  const directory = join(root, name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n${body}\n`)
}

async function waitFor(check: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 4_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  assert.fail(`timed out waiting for ${label}`)
}

/**
 * Check the exact Desktop patch composition before running the registry test.
 * The runtime test below proves the registry merge; these rows prove Desktop
 * still mounts the official provider in preset scopes and OwnDsh can remain in
 * the host layer. Keeping both checks here prevents a passing unit test from
 * masking a later patch that moves or disables the official provider.
 */
async function verifyDesktopComposition(root: string): Promise<void> {
  const files = {
    base: join(root, 'packages/bundle/base/cordis.patch.yml'),
    web: join(root, 'packages/bundle/web-app/cordis.patch.yml'),
    standard: join(root, 'packages/bundle/web-app/presets/standard.patch.yml'),
    ptc: join(root, 'packages/bundle/web-app/presets/ptc.patch.yml'),
  }
  if (!existsSync(files.base)) {
    if (process.env.OWNDSH_REQUIRE_DESKTOP_SKILL_COMPOSITION === '1') {
      assert.fail(`Desktop Harness checkout is required but missing: ${root}`)
    }
    console.log(`desktop skill composition skipped: checkout not found at ${root}`)
    return
  }
  const [base, web, standard, ptc] = await Promise.all(Object.values(files).map(path => readFile(path, 'utf8')))
  assert.match(base, /- id: skill\n\s+name: '@deepseek-ai\/dsh-skill'/)
  assert.match(base, /- id: skill-filesystem\n\s+name: '@deepseek-ai\/dsh-skill-filesystem'/)
  assert.match(base, /- id: tool-skill\n\s+name: '@deepseek-ai\/dsh-tool-skill'/)
  assert.match(web, /- id: skill-filesystem\n\s+disabled: true/)
  for (const [preset, source] of [['standard', standard], ['ptc', ptc]] as const) {
    assert.match(source, /- id: skill-filesystem\n\s+name: '@deepseek-ai\/dsh-skill-filesystem'/, `${preset} preset must mount official filesystem provider`)
    assert.match(source, /- id: tool-skill\n\s+name: '@deepseek-ai\/dsh-tool-skill'/, `${preset} preset must mount official skill tool`)
  }
  console.log(`desktop skill composition verified: ${root}`)
}

const commit = git('rev-parse', 'HEAD')
assert.equal(commit, EXPECTED_COMMIT, `Harness checkout must be dsh-v${EXPECTED_VERSION}`)
const manifest = JSON.parse(await readFile(join(harnessRoot, 'package.json'), 'utf8')) as { version: string }
assert.equal(manifest.version, EXPECTED_VERSION)
await verifyDesktopComposition(desktopHarnessRoot)

const tempRoot = await mkdtemp(join(homedir(), '.owndsh-skill-gate-'))
try {
  const dshHome = join(tempRoot, '.dsh')
  const agentsHome = join(tempRoot, '.agents')
  const project = join(tempRoot, 'workspace')
  const ownRoot = join(dshHome, 'enterprise/skills')
  await mkdir(join(project, '.git'), { recursive: true })
  await writeSkill(join(project, '.dsh/skills'), 'project-noise')
  await writeSkill(join(project, '.agents/skills'), 'project-agents-noise')
  await writeSkill(join(project, '.dsh/skills'), 'shared', '', 'project wins the same-name conflict', 'project wins the same-name conflict')
  await writeSkill(join(dshHome, 'skills'), 'user-noise')
  await writeSkill(join(agentsHome, 'skills'), 'agents-noise')
  await writeSkill(ownRoot, 'both')
  await writeSkill(ownRoot, 'shared', '', 'own is shadowed inside a preset scope', 'own is shadowed inside a preset scope')
  await writeSkill(ownRoot, 'model', 'user-invocable: false\n')
  await writeSkill(ownRoot, 'user', 'disable-model-invocation: true\n')
  await writeSkill(ownRoot, 'trusted', 'disable-model-invocation: true\nuser-invocable: false\n')
  await writeSkill(ownRoot, 'mutable', '', 'before')

  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  const fiber = await ctx.plugin(SkillFileSystem, {
    providerName: 'owndsh',
    includeDefaultRoots: false,
    customSkillDirs: [ownRoot],
    dshHome,
    agentsHome,
    watch: true,
    watchUsePolling: true,
    watchPollIntervalMs: 20,
    watchStabilityThresholdMs: 20,
  })

  const names = (await ctx.skills.list({ cwd: project })).map(skill => skill.name)
  assert.deepEqual(names, ['both', 'model', 'mutable', 'shared', 'trusted', 'user'])

  for (const presetId of ['standard', 'ptc']) {
    const preset = createScope(ctx, { preset: presetId })
    try {
      await preset.ctx.plugin(SkillFileSystem, {
        providerName: 'filesystem',
        includeDefaultRoots: true,
        customSkillDirs: [],
        dshHome,
        agentsHome,
        watch: true,
        watchUsePolling: true,
        watchPollIntervalMs: 20,
        watchStabilityThresholdMs: 20,
      })
      const scoped = await ctx.skills.list({ cwd: project, scope: scopeOf(preset.ctx) })
      assert.deepEqual(scoped.map(skill => skill.name), [
        'agents-noise', 'both', 'model', 'mutable', 'project-agents-noise', 'project-noise', 'shared', 'trusted', 'user', 'user-noise',
      ])
      assert.equal(scoped.find(skill => skill.name === 'shared')?.description, 'project wins the same-name conflict')
      assert.equal(scoped.find(skill => skill.name === 'shared')?.provider, 'filesystem')
    } finally {
      await preset.dispose()
    }
  }

  const policies = Object.fromEntries((await ctx.skills.list({ cwd: project })).map(skill => [skill.name, skill.invocation]))
  assert.deepEqual(policies, {
    both: { modelInvocable: true, userInvocable: true },
    model: { modelInvocable: true, userInvocable: false },
    mutable: { modelInvocable: true, userInvocable: true },
    shared: { modelInvocable: true, userInvocable: true },
    trusted: { modelInvocable: false, userInvocable: false },
    user: { modelInvocable: false, userInvocable: true },
  })
  for (const name of ['both', 'model', 'user', 'trusted']) {
    assert.equal((await ctx.skills.get(name, { cwd: project }))?.name, name)
  }

  const mutableFile = join(ownRoot, 'mutable/SKILL.md')
  const replacement = join(ownRoot, 'mutable/.SKILL.md.next')
  await writeFile(replacement, '---\nname: mutable\ndescription: mutable-updated\n---\n\nafter\n')
  await rename(replacement, mutableFile)
  await waitFor(async () => (await ctx.skills.get('mutable', { cwd: project }))?.description === 'mutable-updated', 'provider invalidate after atomic replacement')
  await rm(join(ownRoot, 'mutable'), { recursive: true, force: true })
  await waitFor(async () => (await ctx.skills.list({ cwd: project })).every(skill => skill.name !== 'mutable'), 'provider invalidate after removal')

  await fiber.dispose()
  console.log(`skill provider gate passed: dsh-v${EXPECTED_VERSION} ${EXPECTED_COMMIT}`)
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
