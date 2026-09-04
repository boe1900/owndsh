/**
 * [INPUT]: 依赖 node:test、node:assert 与 upstream-baseline.mjs 的纯校验函数
 * [OUTPUT]: 提供 Desktop/Harness 锁格式、派生关系与仓库地址归一化的回归测试
 * [POS]: scripts 的基线工具单测，隔离验证失败分支而不访问网络或改动真实源码目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeRepositoryUrl,
  validateDesktopHarnessAlignment,
  validateDesktopLock,
  validateHarnessLock,
} from './upstream-baseline.mjs'

const COMMIT = '7180b529776834fee912113b23f0bd7a387a8222'

test('validateHarnessLock requires both release version and exact commit', () => {
  assert.equal(
    validateHarnessLock({
      repository: 'https://example.com/harness.git',
      version: '0.1.0-rc.5',
      commit: COMMIT,
    }).commit,
    COMMIT,
  )
  assert.throws(
    () =>
      validateHarnessLock({
        repository: 'https://example.com/harness.git',
        commit: COMMIT,
      }),
    /missing version/,
  )
})

test('Desktop lock owns the exact Harness baseline', () => {
  const harness = {
    repository: 'https://example.com/harness.git',
    version: '0.1.1-rc.2',
    commit: COMMIT,
    derivedFrom: 'dsh-desktop.lock.json#harness',
  }
  const desktop = validateDesktopLock({
    repository: 'https://example.com/desktop.git',
    version: '2.0.3',
    commit: COMMIT,
    license: 'MIT',
    harness: { repository: harness.repository, version: harness.version, commit: harness.commit },
  })

  assert.doesNotThrow(() => validateDesktopHarnessAlignment(desktop, harness))
  assert.throws(
    () => validateDesktopHarnessAlignment(desktop, { ...harness, version: 'different' }),
    /Harness version differs/,
  )
})

test('normalizeRepositoryUrl ignores transport-only suffix differences', () => {
  assert.equal(
    normalizeRepositoryUrl('https://example.com/repository.git/'),
    'https://example.com/repository',
  )
})
