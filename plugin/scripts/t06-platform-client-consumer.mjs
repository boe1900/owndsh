/**
 * [INPUT]: 依赖已构建 platform-client/contracts tgz、Corepack pnpm 与全新临时 consumer
 * [OUTPUT]: 提供不依赖 ambient shim 的真实 package install/import/installation/built-lib 验收
 * [POS]: plugin T06 树外包消费者门禁，证明发布产物不借用 workspace 或同级 Harness 源码
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

const platformTgz = resolve(option(
  '--platform-tgz',
  resolve(PROJECT_ROOT, 'artifacts', 'owndsh-platform-client-0.1.0.tgz'),
))
const contractsTgz = resolve(option(
  '--contracts-tgz',
  resolve(PROJECT_ROOT, 'artifacts', 'owndsh-contracts-0.1.0.tgz'),
))
const keep = args.includes('--keep')
const root = await mkdtemp(resolve(tmpdir(), 'enterprise-t06-consumer-'))
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
      reject(new Error(`${command} ${commandArgs.join(' ')} failed (${String(code ?? signal)})\n${stdout}\n${stderr}`))
    })
  })
}

try {
  await mkdir(consumer)
  await writeFile(resolve(consumer, 'package.json'), JSON.stringify({
    name: 'enterprise-t06-package-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@deepseek-ai/cordis': '4.0.1',
      '@owndsh/contracts': `file:${contractsTgz}`,
      '@owndsh/platform-client': `file:${platformTgz}`,
    },
  }, null, 2))
  await writeFile(resolve(consumer, 'pnpm-workspace.yaml'), [
    'packages:',
    "  - '.'",
    'overrides:',
    `  '@owndsh/contracts': 'file:${contractsTgz}'`,
    '',
  ].join('\n'))
  await run('corepack', ['pnpm@11.7.0', 'install', '--ignore-scripts'], {
    cwd: consumer,
    env: process.env,
  })

  const imported = await run(process.execPath, [
    '--input-type=module',
    '--eval',
    [
      "import * as client from '@owndsh/platform-client'",
      "if (typeof client.EnterprisePlatformService !== 'function') process.exit(2)",
      "if (typeof client.registerEnterpriseLocalApi !== 'function') process.exit(3)",
      "const installation = await client.loadOrCreateInstallation({ name: 'Consumer Workstation' })",
      'process.stdout.write(JSON.stringify(installation))',
    ].join(';'),
  ], { cwd: consumer, env: { ...process.env, DSH_HOME: dshHome } })
  const installation = JSON.parse(imported.stdout)
  assert.match(installation.installationId, /^[0-9a-f-]{36}$/i)

  const installedRoot = resolve(consumer, 'node_modules', '@owndsh', 'platform-client')
  const manifest = JSON.parse(await readFile(resolve(installedRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['@owndsh/contracts'], '0.1.0')
  assert.equal(manifest.dependencies.zod, '4.4.3')
  const built = [
    await readFile(resolve(installedRoot, 'lib', 'index.js'), 'utf8'),
    await readFile(resolve(installedRoot, 'lib', 'platform-service.js'), 'utf8'),
    await readFile(resolve(installedRoot, 'lib', 'platform-service.d.ts'), 'utf8'),
  ].join('\n')
  assert.doesNotMatch(built, /declare module ['"]@deepseek-ai\/dsh-typert-protocol/)
  assert.doesNotMatch(built, /\/deepseek-harness\/|\.\.\/deepseek-harness/)
  const device = await readFile(resolve(dshHome, 'enterprise', 'device.json'), 'utf8')
  assert.doesNotMatch(device, /token|authorization|secret/i)

  process.stdout.write(`${JSON.stringify({
    ambientShim: 'absent',
    builtLibImport: 'passed',
    installationFile: 'non-secret',
    packageConsumer: 'passed',
    temporaryRoot: keep ? root : undefined,
  }, null, 2)}\n`)
} finally {
  if (!keep) await rm(root, { force: true, recursive: true })
}
