/**
 * [INPUT]: 依赖当前 workspace package.json、pnpm-workspace.yaml、Desktop/Harness 版本锁与同级只读 checkout 清单
 * [OUTPUT]: 提供 Desktop 派生工具链、正式包集合和源码边界的自动验收测试
 * [POS]: plugin 的根级不变量测试，防止产品插件耦合 Harness 源码或偏离 Desktop 发行基线
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
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

test('workspace uses the Desktop-owned Harness baseline and toolchain', async () => {
  const [workspace, harness, desktop, harnessLock, desktopLock] = await Promise.all([
    readJson(resolve(WORKSPACE_ROOT, 'package.json')),
    readJson(resolve(HARNESS_ROOT, 'package.json')),
    readJson(resolve(DESKTOP_ROOT, 'package.json')),
    readJson(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json')),
    readJson(resolve(PROJECT_ROOT, 'upstream', 'dsh-desktop.lock.json')),
  ])

  assert.equal(workspace.private, true)
  assert.equal(workspace.packageManager, harness.packageManager)
  assert.deepEqual(workspace.engines, harness.engines)
  assert.deepEqual(workspace.engines, desktop.engines)
  assert.equal(desktop.version, desktopLock.version)
  assert.equal(harness.version, harnessLock.version)
  assert.deepEqual(desktopLock.harness, {
    repository: harnessLock.repository,
    version: harnessLock.version,
    commit: harnessLock.commit,
  })
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
  assert.match(definition, /allowBuilds:\n  esbuild: true\n$/)
  assert.doesNotMatch(definition, /deepseek-harness|\.\.\//)
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
    'plugin-distribution',
    'session-sync',
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
