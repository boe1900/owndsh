/**
 * [INPUT]: 依赖 upstream 的产品锁、Desktop/Harness 锁、Git/Tar CLI 与上游仓库网络可达性
 * [OUTPUT]: 对外提供 Desktop→Harness 一致性、产品源码原子导入与 T00 基线检查
 * [POS]: scripts 的 T00 基线工具，以 Desktop 为客户端版本真源并维护第三方源码可复现性
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..')
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

const PRODUCT_SOURCES = [
  {
    lockFile: 'server-framework.lock.json',
    target: 'server',
    requiredFile: 'pom.xml',
    executableFiles: ['mvnw'],
  },
]

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

export function validateProductLock(lock, label = 'product lock') {
  if (typeof lock?.repository !== 'string' || !lock.repository) {
    fail(`${label} is missing repository`)
  }
  if (typeof lock?.ref !== 'string' || !lock.ref) {
    fail(`${label} is missing ref`)
  }
  if (lock.license !== 'MIT') {
    fail(`${label} must preserve the MIT license`)
  }
  if (
    lock.licenseFile !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(lock.licenseFile)
  ) {
    fail(`${label} licenseFile must be a repository-local filename`)
  }
  if (lock.licenseFile !== undefined) {
    validateCommit(lock.licenseSourceCommit, `${label} licenseSourceCommit`)
    validateCommit(lock.licenseBlob, `${label} licenseBlob`)
  }
  validateCommit(lock.commit, `${label} commit`)
  return lock
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

export function resolveRefCommit(lsRemoteOutput, ref) {
  const refs = new Map()
  for (const line of lsRemoteOutput.trim().split('\n')) {
    if (!line) continue
    const [commit, name] = line.split(/\s+/, 2)
    validateCommit(commit, `remote ${name}`)
    refs.set(name, commit)
  }

  return (
    refs.get(`refs/tags/${ref}^{}`) ??
    refs.get(`refs/heads/${ref}`) ??
    refs.get(`refs/tags/${ref}`) ??
    null
  )
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

function verifyRemoteProductSource(source, lock) {
  const output = run(
    'git',
    [
      'ls-remote',
      lock.repository,
      `refs/heads/${lock.ref}`,
      `refs/tags/${lock.ref}`,
      `refs/tags/${lock.ref}^{}`,
    ],
    { capture: true },
  )
  const remoteCommit = resolveRefCommit(output, lock.ref)
  if (remoteCommit !== lock.commit) {
    fail(
      `${source.lockFile} expected ${lock.commit} at ${lock.ref}, got ${remoteCommit ?? 'no matching ref'}`,
    )
  }
  process.stdout.write(`verified ${source.lockFile}: ${lock.commit}\n`)
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

function verifyImportedSource(source, lock) {
  const target = join(PROJECT_ROOT, source.target)
  if (!existsSync(join(target, source.requiredFile))) {
    fail(`imported source is incomplete: ${target}`)
  }
  if (existsSync(join(target, '.git'))) {
    fail(`imported source must not contain Git metadata: ${target}`)
  }
  if (!existsSync(join(target, 'LICENSE'))) {
    fail(`imported source must preserve an MIT LICENSE: ${target}`)
  }
  if (
    lock.licenseFile &&
    !readFileSync(join(target, 'LICENSE')).equals(
      readFileSync(join(PROJECT_ROOT, 'upstream', lock.licenseFile)),
    )
  ) {
    fail(`imported LICENSE differs from ${lock.licenseFile}: ${target}`)
  }
  if (process.platform !== 'win32') {
    for (const executableFile of source.executableFiles ?? []) {
      accessSync(join(target, executableFile), constants.X_OK)
    }
  }
}

function importProductSource(source, lock) {
  const target = join(PROJECT_ROOT, source.target)
  if (existsSync(target)) {
    fail(`refusing to overwrite existing target: ${target}`)
  }

  const cloneRoot = mkdtempSync(join(tmpdir(), 'enterprise-upstream-'))
  const clone = join(cloneRoot, 'repository')
  const archive = join(cloneRoot, `${source.target}.tar`)
  const staging = mkdtempSync(
    join(PROJECT_ROOT, `.${basename(source.target)}-import-`),
  )

  try {
    run('git', [
      'clone',
      '--filter=blob:none',
      '--no-checkout',
      lock.repository,
      clone,
    ])
    run('git', ['-C', clone, 'cat-file', '-e', `${lock.commit}^{commit}`])
    run('git', [
      '-C',
      clone,
      'archive',
      '--format=tar',
      `--output=${archive}`,
      lock.commit,
    ])
    run('tar', ['-xf', archive, '-C', staging])
    for (const executableFile of source.executableFiles ?? []) {
      chmodSync(join(staging, executableFile), 0o755)
    }
    if (!existsSync(join(staging, 'LICENSE')) && lock.licenseFile) {
      copyFileSync(
        join(PROJECT_ROOT, 'upstream', lock.licenseFile),
        join(staging, 'LICENSE'),
      )
    }
    renameSync(staging, target)
    process.stdout.write(`imported ${source.target}: ${lock.commit}\n`)
  } finally {
    rmSync(cloneRoot, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  }
}

export function loadBaselineLocks(projectRoot = PROJECT_ROOT) {
  const lockRoot = join(projectRoot, 'upstream')
  const products = PRODUCT_SOURCES.map((source) => ({
    source,
    lock: validateProductLock(
      readJson(join(lockRoot, source.lockFile)),
      source.lockFile,
    ),
  }))
  const harness = validateHarnessLock(
    readJson(join(lockRoot, 'deepseek-harness.lock.json')),
    'deepseek-harness.lock.json',
  )
  const desktop = validateDesktopLock(
    readJson(join(lockRoot, 'dsh-desktop.lock.json')),
    'dsh-desktop.lock.json',
  )
  validateDesktopHarnessAlignment(desktop, harness)
  return { products, desktop, harness }
}

export function verifyBaseline({ requireImports = true } = {}) {
  const { products, desktop, harness } = loadBaselineLocks()
  for (const { source, lock } of products) {
    verifyRemoteProductSource(source, lock)
    if (requireImports) verifyImportedSource(source, lock)
  }
  verifyDesktopCheckout(desktop)
  verifyHarnessCheckout(harness)
}

export function importProductBaselines() {
  const { products } = loadBaselineLocks()
  for (const { source, lock } of products) {
    verifyRemoteProductSource(source, lock)
  }
  for (const { source, lock } of products) {
    importProductSource(source, lock)
  }
}

function usage() {
  process.stderr.write(
    'usage: node scripts/upstream-baseline.mjs <verify-locks|import|verify>\n',
  )
}

function main() {
  const action = process.argv[2]
  if (action === 'verify-locks') {
    verifyBaseline({ requireImports: false })
    return
  }
  if (action === 'import') {
    importProductBaselines()
    return
  }
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
