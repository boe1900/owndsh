/**
 * [INPUT]: 依赖 workspace 清单、真实 pnpm 调度、Desktop/Harness 版本锁与可选同级只读 checkout
 * [OUTPUT]: 提供工具链、嵌套构建共享产物互斥、正式包集合、源码边界及本地 checkout 精确基线测试
 * [POS]: plugin 的根级不变量测试，以隔离 workspace 验证调度，不生成产品产物或依赖同级源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const DESKTOP_ROOT = resolve(PROJECT_ROOT, '..', 'dsh-desktop')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

test('workspace uses the locked Desktop-owned Harness baseline and toolchain', async () => {
  const [workspace, harnessLock, desktopLock] = await Promise.all([
    readJson(resolve(WORKSPACE_ROOT, 'package.json')),
    readJson(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json')),
    readJson(resolve(PROJECT_ROOT, 'upstream', 'dsh-desktop.lock.json')),
  ])

  assert.equal(workspace.private, true)
  assert.equal(workspace.packageManager, 'pnpm@11.7.0')
  assert.deepEqual(workspace.engines, { node: '>=24.9.0' })
  assert.deepEqual(desktopLock.harness, {
    repository: harnessLock.repository,
    version: harnessLock.version,
    commit: harnessLock.commit,
  })
  if (!existsSync(HARNESS_ROOT) || !existsSync(DESKTOP_ROOT)) return

  const [harness, desktop] = await Promise.all([
    readJson(resolve(HARNESS_ROOT, 'package.json')),
    readJson(resolve(DESKTOP_ROOT, 'package.json')),
  ])
  assert.equal(workspace.packageManager, harness.packageManager)
  assert.equal(desktop.version, desktopLock.version)
  assert.equal(harness.version, harnessLock.version)
  assert.equal(
    execFileSync('git', ['-C', DESKTOP_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    desktopLock.commit,
  )
  assert.equal(
    execFileSync('git', ['-C', HARNESS_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    harnessLock.commit,
  )
  assert.equal(
    execFileSync('git', ['-C', resolve(DESKTOP_ROOT, 'deepseek-harness'), 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    harnessLock.commit,
  )
})

test('workspace only discovers product packages below packages', async () => {
  const definition = await readFile(
    resolve(WORKSPACE_ROOT, 'pnpm-workspace.yaml'),
    'utf8',
  )

  assert.match(definition, /^packages:\n  - packages\/\*\n/)
  assert.match(
    definition,
    /allowBuilds:\n  '@google\/genai': false\n  esbuild: true\n  protobufjs: false\n/,
  )
  assert.doesNotMatch(definition, /deepseek-harness|\.\.\//)
})

test('nested workspace builds never read or overwrite an active dependency output', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'owndsh-workspace-build-'))
  try {
    const [definition, workspace] = await Promise.all([
      readFile(resolve(WORKSPACE_ROOT, 'pnpm-workspace.yaml'), 'utf8'),
      readJson(resolve(WORKSPACE_ROOT, 'package.json')),
    ])
    await writeFile(resolve(temporaryRoot, 'pnpm-workspace.yaml'), definition)
    await writeFile(resolve(temporaryRoot, 'package.json'), JSON.stringify({
      name: 'workspace-build-fixture',
      private: true,
      packageManager: workspace.packageManager,
    }))
    await writeFile(resolve(temporaryRoot, 'step.mjs'), `
import assert from 'node:assert/strict'
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const writing = resolve(root, 'contracts.writing')
const output = resolve(root, 'contracts.d.ts')
if (process.argv[2] === 'contracts') {
  const writer = openSync(writing, 'wx')
  try {
    writeFileSync(output, '')
    await setTimeout(300)
    writeFileSync(output, 'export type Contract = string\\n')
  } finally {
    closeSync(writer)
    unlinkSync(writing)
  }
} else {
  assert.equal(existsSync(writing), false, 'dependency output is still being written')
  assert.equal(readFileSync(output, 'utf8'), 'export type Contract = string\\n')
  await setTimeout(100)
  assert.equal(existsSync(writing), false, 'dependency output was overwritten while in use')
  writeFileSync(resolve(root, process.argv[2] + '.checked'), 'ready')
}
`)
    const packages = {
      contracts: [],
      first: ['contracts'],
      second: ['contracts'],
      bundle: ['first', 'second'],
    }
    for (const [name, dependencies] of Object.entries(packages)) {
      const directory = resolve(temporaryRoot, 'packages', name)
      await mkdir(directory, { recursive: true })
      const prepare = dependencies.length > 0
        ? `pnpm --filter @fixture/${name}^... run build && `
        : ''
      await writeFile(resolve(directory, 'package.json'), JSON.stringify({
        name: `@fixture/${name}`,
        version: '1.0.0',
        scripts: {
          build: `${prepare}node ../../step.mjs ${name}`,
          typecheck: name === 'contracts' ? 'node --version' : `${prepare}node ../../step.mjs ${name}`,
        },
        dependencies: Object.fromEntries(dependencies.map(dependency => [
          `@fixture/${dependency}`, 'workspace:*',
        ])),
      }))
    }

    execFileSync('pnpm', ['--recursive', '--if-present', 'run', 'typecheck'], {
      cwd: temporaryRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60_000,
    })
    for (const name of ['first', 'second', 'bundle']) {
      assert.equal(await readFile(resolve(temporaryRoot, `${name}.checked`), 'utf8'), 'ready')
    }
    assert.equal(await readFile(resolve(temporaryRoot, 'contracts.d.ts'), 'utf8'), 'export type Contract = string\n')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('workspace uses only the formal product package boundaries', async () => {
  const packages = (await readdir(resolve(WORKSPACE_ROOT, 'packages'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()

  assert.deepEqual(packages, [
    'bundle',
    'contracts',
    'llm-gateway',
    'platform-client',
    'remote-core',
    'ui',
  ])
})

test('product sources do not import the sibling Harness or Typert Remote shims', async () => {
  const pending = [resolve(WORKSPACE_ROOT, 'packages')]
  const sourceFiles = []
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'lib' && entry.name !== 'node_modules') pending.push(path)
      } else if (/\.(?:ts|tsx|mjs|yml)$/.test(entry.name)) {
        sourceFiles.push(path)
      }
    }
  }
  const source = (await Promise.all(sourceFiles.map(path => readFile(path, 'utf8')))).join('\n')
  assert.doesNotMatch(source, /from ['"][^'"]*deepseek-harness/)
  assert.doesNotMatch(source, /declare module ['"]@deepseek-ai\/dsh-typert-protocol/)
  assert.doesNotMatch(source, /TypertRemoteService|ctx\.remote\.\$mount/)
})
