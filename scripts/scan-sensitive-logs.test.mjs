/**
 * [INPUT]: 依赖 Node test runner、自动清理的临时日志与 scan-sensitive-logs CLI。
 * [OUTPUT]: 验证干净目录、Bearer、credential、精确 literal 和不回显秘密的诊断。
 * [POS]: scripts 扫描器的自验门禁，防止 CI 只运行一个永远成功的壳命令。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'scan-sensitive-logs.mjs')

test('accepts recursively discovered clean logs', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 't20-log-clean-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'nested'))
  await writeFile(path.join(root, 'server.log'), 'requestId=req_01 status=200\n')
  await writeFile(path.join(root, 'nested', 'worker.log'), 'quota lease released\n')

  const result = run(root)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /2 个文件，0 命中/u)
})

test('rejects builtin secret shapes without echoing their values', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 't20-log-pattern-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const controlled = 'Bearer t20-should-never-be-logged'
  await writeFile(path.join(root, 'server.log'), `${controlled}\n`)

  const result = run(root)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /pattern=bearer-token/u)
  assert.doesNotMatch(result.stderr, /t20-should-never-be-logged/u)
})

test('rejects controlled plaintext from a separate literal file', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 't20-log-literal-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const literal = 'T20 controlled session plaintext'
  const literals = path.join(root, 'literals.txt')
  const log = path.join(root, 'server.log')
  await writeFile(literals, `${literal}\n`)
  await writeFile(log, `unexpected payload: ${literal}\n`)

  const result = run('--literal-file', literals, log)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /pattern=controlled-literal-1/u)
  assert.doesNotMatch(result.stderr, new RegExp(literal, 'u'))
})

function run(...argumentsList) {
  return spawnSync(process.execPath, [SCRIPT, ...argumentsList], { encoding: 'utf8' })
}
