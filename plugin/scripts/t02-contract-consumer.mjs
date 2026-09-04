/**
 * [INPUT]: 依赖已构建 contracts tgz、Corepack pnpm 与本机临时目录
 * [OUTPUT]: 提供无 workspace 链接或 ambient shim 的公开 ESM、品牌 ID、严格错误解码和协议 hash 验收
 * [POS]: plugin 的 T02 真实 package consumer，只安装发布 tarball 并在退出时清理临时目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const args = process.argv.slice(2)
const tgzOption = args.indexOf('--tgz')
const tgz = resolve(tgzOption === -1
  ? resolve(PROJECT_ROOT, 'artifacts', 'owndsh-contracts-0.1.0.tgz')
  : args[tgzOption + 1])
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'enterprise-t02-contract-consumer-'))

function run(command, commandArgs, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
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
  const consumer = resolve(temporaryRoot, 'consumer')
  await mkdir(consumer)
  await writeFile(resolve(consumer, 'package.json'), `${JSON.stringify({
    name: 'enterprise-t02-contract-consumer',
    private: true,
    type: 'module',
  }, null, 2)}\n`)
  await run('corepack', ['pnpm@11.7.0', 'add', '--ignore-scripts', tgz], consumer)
  const result = await run(process.execPath, [
    '--input-type=module',
    '--eval',
    [
      "import assert from 'node:assert/strict'",
      "import * as contracts from '@owndsh/contracts'",
      "assert.equal(contracts.parseEnterpriseUserId('73001'), '73001')",
      "assert.match(contracts.enterpriseProtocolSha256, /^[0-9a-f]{64}$/)",
      "assert.throws(() => contracts.decodeEnterpriseError({ error: { code: 'ENT_PLATFORM_UNAVAILABLE', debugTrace: 'forbidden', message: 'unavailable', requestId: 'req_01ARZ3NDEKTSV4RRFFQ69G5FAV', retryable: true } }))",
      "process.stdout.write(contracts.enterpriseProtocolSha256)",
    ].join(';'),
  ], consumer)
  assert.match(result.stdout, /^[0-9a-f]{64}$/)
  process.stdout.write(`${JSON.stringify({
    packageConsumer: 'passed',
    protocolSha256: result.stdout,
  }, null, 2)}\n`)
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
