/**
 * [INPUT]: 依赖 upstream 的 Desktop/Harness 版本锁与 Git CLI
 * [OUTPUT]: 对外提供 Desktop→Harness 一致性与本地 checkout 基线检查
 * [POS]: scripts 的客户端基线工具，以 Desktop 为 Harness 兼容版本真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..')
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

function fail(message) {
  throw new Error(message)
}

export function normalizeRepositoryUrl(repository) {
  return repository.replace(/\/$/, '').replace(/\.git$/, '')
}

export function validateCommit(commit, label = 'commit') {
  if (!COMMIT_PATTERN.test(commit)) {
    fail(`${label} must be a 40-character lowercase Git commit`)
  }
  return commit
}

export function validateHarnessLock(lock, label = 'Harness lock') {
  if (typeof lock?.repository !== 'string' || !lock.repository) {
    fail(`${label} is missing repository`)
  }
  if (typeof lock?.version !== 'string' || !lock.version) {
    fail(`${label} is missing version`)
  }
  validateCommit(lock.commit, `${label} commit`)
  return lock
}

export function validateDesktopLock(lock, label = 'Desktop lock') {
  if (typeof lock?.repository !== 'string' || !lock.repository) {
    fail(`${label} is missing repository`)
  }
  if (typeof lock?.version !== 'string' || !lock.version) {
    fail(`${label} is missing version`)
  }
  if (lock.license !== 'MIT') fail(`${label} must preserve the MIT license`)
  validateCommit(lock.commit, `${label} commit`)
  validateHarnessLock(lock.harness, `${label} harness`)
  return lock
}

export function validateDesktopHarnessAlignment(desktop, harness) {
  if (harness.derivedFrom !== 'dsh-desktop.lock.json#harness') {
    fail('deepseek-harness.lock.json must declare the Desktop-derived baseline')
  }
  for (const key of ['repository', 'version', 'commit']) {
    if (desktop.harness[key] !== harness[key]) {
      fail(`Desktop Harness ${key} differs from deepseek-harness.lock.json`)
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  })
}

function verifyHarnessCheckout(lock) {
  const checkout = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
  if (!existsSync(join(checkout, '.git'))) {
    fail(`Harness checkout is missing: ${checkout}`)
  }

  const origin = run('git', ['-C', checkout, 'remote', 'get-url', 'origin'], {
    capture: true,
  }).trim()
  if (normalizeRepositoryUrl(origin) !== normalizeRepositoryUrl(lock.repository)) {
    fail(`Harness origin mismatch: expected ${lock.repository}, got ${origin}`)
  }

  const head = run('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
    capture: true,
  }).trim()
  if (head !== lock.commit) {
    fail(`Harness commit mismatch: expected ${lock.commit}, got ${head}`)
  }

  const status = run('git', ['-C', checkout, 'status', '--porcelain'], {
    capture: true,
  }).trim()
  if (status) {
    fail(`Harness checkout has local changes: ${checkout}`)
  }

  const manifest = readJson(join(checkout, 'package.json'))
  if (manifest.version !== lock.version) {
    fail(`Harness version mismatch: expected ${lock.version}, got ${manifest.version}`)
  }
  process.stdout.write(`verified deepseek-harness.lock.json: ${lock.commit}\n`)
}

function verifyDesktopCheckout(lock) {
  const checkout = resolve(PROJECT_ROOT, '..', 'dsh-desktop')
  if (!existsSync(join(checkout, '.git'))) {
    fail(`Desktop checkout is missing: ${checkout}`)
  }
  const origin = run('git', ['-C', checkout, 'remote', 'get-url', 'origin'], { capture: true }).trim()
  if (normalizeRepositoryUrl(origin) !== normalizeRepositoryUrl(lock.repository)) {
    fail(`Desktop origin mismatch: expected ${lock.repository}, got ${origin}`)
  }
  const head = run('git', ['-C', checkout, 'rev-parse', 'HEAD'], { capture: true }).trim()
  if (head !== lock.commit) fail(`Desktop commit mismatch: expected ${lock.commit}, got ${head}`)
  const status = run('git', ['-C', checkout, 'status', '--porcelain'], { capture: true }).trim()
  if (status) fail(`Desktop checkout has local changes: ${checkout}`)
  const manifest = readJson(join(checkout, 'package.json'))
  if (manifest.version !== lock.version) {
    fail(`Desktop version mismatch: expected ${lock.version}, got ${manifest.version}`)
  }
  const gitlink = run('git', ['-C', checkout, 'ls-tree', 'HEAD', 'deepseek-harness'], { capture: true }).trim()
  if (!gitlink.includes(`commit ${lock.harness.commit}\tdeepseek-harness`)) {
    fail(`Desktop Harness gitlink differs from ${lock.harness.commit}`)
  }
  process.stdout.write(`verified dsh-desktop.lock.json: ${lock.commit}\n`)
}

export function loadBaselineLocks(projectRoot = PROJECT_ROOT) {
  const lockRoot = join(projectRoot, 'upstream')
  const harness = validateHarnessLock(
    readJson(join(lockRoot, 'deepseek-harness.lock.json')),
    'deepseek-harness.lock.json',
  )
  const desktop = validateDesktopLock(
    readJson(join(lockRoot, 'dsh-desktop.lock.json')),
    'dsh-desktop.lock.json',
  )
  validateDesktopHarnessAlignment(desktop, harness)
  return { desktop, harness }
}

export function verifyBaseline() {
  const { desktop, harness } = loadBaselineLocks()
  verifyDesktopCheckout(desktop)
  verifyHarnessCheckout(harness)
}

function usage() {
  process.stderr.write(
    'usage: node scripts/upstream-baseline.mjs verify\n',
  )
}

function main() {
  const action = process.argv[2]
  if (action === 'verify') {
    verifyBaseline()
    return
  }
  usage()
  process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
