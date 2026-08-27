/**
 * [INPUT]: 依赖 node:test、node:assert 与 upstream-baseline.mjs 的纯校验函数
 * [OUTPUT]: 提供 T00 上游锁格式、Git 引用解析与仓库地址归一化的回归测试
 * [POS]: scripts 的基线工具单测，隔离验证失败分支而不访问网络或改动真实源码目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeRepositoryUrl,
  resolveRefCommit,
  validateCommit,
  validateDesktopHarnessAlignment,
  validateDesktopLock,
  validateHarnessLock,
  validateProductLock,
} from './upstream-baseline.mjs'

const COMMIT = '7180b529776834fee912113b23f0bd7a387a8222'

test('validateProductLock accepts the frozen product lock shape', () => {
  const lock = {
    repository: 'https://example.com/product.git',
    ref: 'v1.0.0',
    commit: COMMIT,
    license: 'MIT',
  }

  assert.equal(validateProductLock(lock), lock)
})

test('validateProductLock accepts a provenance-locked license supplement', () => {
  const lock = {
    repository: 'https://example.com/product.git',
    ref: 'v1.0.0',
    commit: COMMIT,
    license: 'MIT',
    licenseFile: 'product.LICENSE',
    licenseSourceCommit: COMMIT,
    licenseBlob: '32b3071127d6804695f8672fdd25ee3c8ef10595',
  }

  assert.equal(validateProductLock(lock), lock)
})

test('validateProductLock rejects a mutable or malformed source description', () => {
  assert.throws(
    () =>
      validateProductLock({
        repository: 'https://example.com/product.git',
        ref: 'main',
        commit: 'short',
        license: 'Apache-2.0',
      }),
    /MIT license/,
  )
  assert.throws(() => validateCommit('ABC'), /40-character lowercase/)
  assert.throws(
    () =>
      validateProductLock({
        repository: 'https://example.com/product.git',
        ref: 'main',
        commit: COMMIT,
        license: 'MIT',
        licenseFile: '../LICENSE',
      }),
    /repository-local filename/,
  )
})

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

test('resolveRefCommit prefers an annotated tag peeled commit', () => {
  const output = [
    '420f89b17645ef85d264031c154b798f774e1caf\trefs/tags/v6.0.0',
    `${COMMIT}\trefs/tags/v6.0.0^{}`,
  ].join('\n')

  assert.equal(resolveRefCommit(output, 'v6.0.0'), COMMIT)
})

test('resolveRefCommit accepts a branch and reports a missing ref', () => {
  assert.equal(
    resolveRefCommit(`${COMMIT}\trefs/heads/6.X-React\n`, '6.X-React'),
    COMMIT,
  )
  assert.equal(resolveRefCommit('', 'missing'), null)
})

test('normalizeRepositoryUrl ignores transport-only suffix differences', () => {
  assert.equal(
    normalizeRepositoryUrl('https://example.com/repository.git/'),
    'https://example.com/repository',
  )
})
