/**
 * [INPUT]: 依赖当前 workspace package.json、pnpm-workspace.yaml、Desktop/Harness 版本锁与可选同级只读 checkout
 * [OUTPUT]: 提供可独立 CI 验证的工具链、生命周期脚本策略、正式包集合、源码边界及本地 checkout 精确基线测试
 * [POS]: plugin 的根级不变量测试，发布不依赖同级源码，本地存在锁定 checkout 时追加验证 commit
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
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

test('workspace uses the locked Desktop-owned Harness baseline and toolchain', async () => {
  const [workspace, harnessLock, desktopLock] = await Promise.all([
    readJson(resolve(WORKSPACE_ROOT, 'package.json')),
    readJson(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json')),
    readJson(resolve(PROJECT_ROOT, 'upstream', 'dsh-desktop.lock.json')),
  ])

  assert.equal(workspace.private, true)
  assert.equal(workspace.packageManager, 'pnpm@11.7.0')
  assert.deepEqual(workspace.engines, { node: '^22.19.0 || >=24.0.0' })
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
  assert.deepEqual(workspace.engines, harness.engines)
  assert.deepEqual(workspace.engines, desktop.engines)
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
    /allowBuilds:\n  '@google\/genai': false\n  esbuild: true\n  protobufjs: false\n$/,
  )
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
