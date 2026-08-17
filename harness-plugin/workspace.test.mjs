/**
 * [INPUT]: 依赖当前 workspace package.json、pnpm-workspace.yaml、Harness 版本锁与同级只读 checkout 清单
 * [OUTPUT]: 提供 T00 插件 workspace 工具链一致性和源码边界的自动验收测试
 * [POS]: harness-plugin 的根级不变量测试，防止产品插件提前耦合 Harness 源码或漂移构建工具链
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

test('workspace uses the locked Harness Node and pnpm toolchain', async () => {
  const [workspace, harness, harnessLock] = await Promise.all([
    readJson(resolve(WORKSPACE_ROOT, 'package.json')),
    readJson(resolve(HARNESS_ROOT, 'package.json')),
    readJson(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json')),
  ])

  assert.equal(workspace.private, true)
  assert.equal(workspace.packageManager, harness.packageManager)
  assert.deepEqual(workspace.engines, harness.engines)
  assert.equal(harness.version, harnessLock.version)
})

test('workspace only discovers product packages below packages', async () => {
  const definition = await readFile(
    resolve(WORKSPACE_ROOT, 'pnpm-workspace.yaml'),
    'utf8',
  )

  assert.match(definition, /^packages:\n  - packages\/\*\n$/)
  assert.doesNotMatch(definition, /deepseek-harness|\.\.\//)
})
