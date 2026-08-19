/**
 * [INPUT]: 依赖已构建 contracts/platform-client/plugin-distribution tgz、Corepack pnpm 与全新临时 consumer
 * [OUTPUT]: 提供无 ambient shim 的真实 package install/import、JCS、原子状态与发布清单验收
 * [POS]: harness-plugin T14 树外包消费者门禁，证明发布产物不借用 workspace 或同级 Harness 源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const contractsTgz = resolve(option(
  '--contracts-tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-contracts-0.1.0.tgz'),
))
const platformTgz = resolve(option(
  '--platform-tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-platform-client-0.1.0.tgz'),
))
const distributionTgz = resolve(option(
  '--distribution-tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-plugin-distribution-0.1.0.tgz'),
))
const keep = args.includes('--keep')
const root = await mkdtemp(resolve(tmpdir(), 'enterprise-t14-consumer-'))
const consumer = resolve(root, 'consumer')
const dshHome = resolve(root, 'dsh-home')

function run(command, commandArgs, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) return resolvePromise({ stdout, stderr })
      reject(new Error(`${command} failed (${String(code ?? signal)})\n${stdout}\n${stderr}`))
    })
  })
}

try {
  await mkdir(consumer)
  await writeFile(resolve(consumer, 'package.json'), JSON.stringify({
    name: 'enterprise-t14-package-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-host-plugin-inventory': '0.1.0-rc.7',
      '@deepseek-ai/dsh-subprocess': '0.1.0-rc.7',
      '@enterprise-agent/dsh-contracts': `file:${contractsTgz}`,
      '@enterprise-agent/dsh-platform-client': `file:${platformTgz}`,
      '@enterprise-agent/dsh-plugin-distribution': `file:${distributionTgz}`,
    },
  }, null, 2))
  await writeFile(resolve(consumer, 'pnpm-workspace.yaml'), [
    'packages:',
    "  - '.'",
    'overrides:',
    `  '@enterprise-agent/dsh-contracts': 'file:${contractsTgz}'`,
    `  '@enterprise-agent/dsh-platform-client': 'file:${platformTgz}'`,
    '',
  ].join('\n'))
  await run('corepack', ['pnpm@11.7.0', 'install', '--ignore-scripts'], { cwd: consumer, env: process.env })

  const imported = await run(process.execPath, [
    '--input-type=module',
    '--eval',
    [
      "import { canonicalizeJson, ManagedPluginStore } from '@enterprise-agent/dsh-plugin-distribution'",
      "if (canonicalizeJson({ b: 2, a: 1 }) !== '{\"a\":1,\"b\":2}') process.exit(2)",
      'const store = new ManagedPluginStore(process.env.DSH_HOME)',
      "await store.write({ formatVersion: 1, assignmentRevision: 7, plugins: [] })",
      'const state = await store.read()',
      'process.stdout.write(JSON.stringify(state))',
    ].join(';'),
  ], { cwd: consumer, env: { ...process.env, DSH_HOME: dshHome } })
  assert.deepEqual(JSON.parse(imported.stdout), { formatVersion: 1, assignmentRevision: 7, plugins: [] })

  const installedRoot = resolve(consumer, 'node_modules', '@enterprise-agent', 'dsh-plugin-distribution')
  const manifest = JSON.parse(await readFile(resolve(installedRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['@enterprise-agent/dsh-contracts'], '0.1.0')
  assert.equal(manifest.dependencies['@enterprise-agent/dsh-platform-client'], '0.1.0')
  assert.equal(manifest.dependencies.semver, '7.8.4')
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-subprocess'], '0.1.0-rc.7')
  const built = [
    await readFile(resolve(installedRoot, 'lib', 'index.js'), 'utf8'),
    await readFile(resolve(installedRoot, 'lib', 'service.js'), 'utf8'),
    await readFile(resolve(installedRoot, 'lib', 'service.d.ts'), 'utf8'),
  ].join('\n')
  assert.doesNotMatch(built, /declare module ['"]@deepseek-ai\/dsh-typert-protocol/)
  assert.doesNotMatch(built, /\/deepseek-harness\/|\.\.\/deepseek-harness/)
  const stateText = await readFile(resolve(dshHome, 'enterprise', 'managed-plugins.json'), 'utf8')
  assert.doesNotMatch(stateText, /token|authorization|secret|publicKey/i)

  process.stdout.write(`${JSON.stringify({
    ambientShim: 'absent',
    builtLibImport: 'passed',
    canonicalization: 'passed',
    packageConsumer: 'passed',
    stateFile: 'atomic-non-secret',
    temporaryRoot: keep ? root : undefined,
  }, null, 2)}\n`)
} finally {
  if (!keep) await rm(root, { force: true, recursive: true })
}
