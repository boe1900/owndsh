/**
 * [INPUT]: 依赖 upstream/dsh-desktop.lock.json、Node.js、Git CLI 与可访问的 Desktop/Harness 仓库
 * [OUTPUT]: 在产品仓库同级目录准备精确 Desktop checkout 及其锁定 Harness submodule
 * [POS]: scripts 的跨平台 Desktop 开发基线入口，不复制或修改任何 Desktop 生命周期代码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'upstream', 'dsh-desktop.lock.json'), 'utf8'))
const args = process.argv.slice(2)
const checkOnly = args[0] === '--check-only'
if (checkOnly) args.shift()
if (args.length > 1) throw new Error('usage: node scripts/bootstrap-desktop.mjs [--check-only] [destination]')
const checkout = resolve(args[0] ?? resolve(PROJECT_ROOT, '..', 'dsh-desktop'))

function git(gitArgs, cwd = PROJECT_ROOT, capture = false) {
  return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
}

function normalized(url) {
  return url.trim().replace(/\/$/, '').replace(/\.git$/, '')
}

if (!existsSync(checkout)) {
  if (checkOnly) throw new Error(`Desktop checkout does not exist: ${checkout}`)
  git(['clone', lock.repository, checkout])
}
if (!existsSync(resolve(checkout, '.git'))) throw new Error(`destination is not a Git checkout: ${checkout}`)
const origin = git(['remote', 'get-url', 'origin'], checkout, true).trim()
if (normalized(origin) !== normalized(lock.repository)) {
  throw new Error(`Desktop origin mismatch: expected ${lock.repository}, got ${origin}`)
}
if (git(['status', '--porcelain'], checkout, true).trim()) {
  throw new Error(`Desktop checkout has local changes: ${checkout}`)
}
if (!checkOnly) {
  git(['fetch', 'origin', '--tags', '--prune'], checkout)
  git(['cat-file', '-e', `${lock.commit}^{commit}`], checkout)
  git(['switch', '--detach', lock.commit], checkout)
  git(['submodule', 'update', '--init', '--recursive'], checkout)
}
const head = git(['rev-parse', 'HEAD'], checkout, true).trim()
if (head !== lock.commit) throw new Error(`Desktop checkout is not at ${lock.commit}: ${checkout}`)
const manifest = JSON.parse(readFileSync(resolve(checkout, 'package.json'), 'utf8'))
if (manifest.version !== lock.version) throw new Error(`Desktop version is ${manifest.version}, expected ${lock.version}`)
const harnessRoot = resolve(checkout, 'deepseek-harness')
if (!existsSync(resolve(harnessRoot, '.git'))) throw new Error(`Desktop Harness submodule is missing: ${harnessRoot}`)
const harnessHead = git(['rev-parse', 'HEAD'], harnessRoot, true).trim()
if (harnessHead !== lock.harness.commit) {
  throw new Error(`Desktop Harness is ${harnessHead}, expected ${lock.harness.commit}`)
}
process.stdout.write(`${JSON.stringify({ checkout, desktop: head, harness: harnessHead, version: manifest.version }, null, 2)}\n`)
