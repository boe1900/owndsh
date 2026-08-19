/**
 * [INPUT]: 依赖已构建 bundle tgz、同级锁定 Harness checkout、Corepack pnpm 与临时 DSH_HOME
 * [OUTPUT]: 提供无 ambient shim consumer、profile layer、真实 Web/API/SSE/Client、插件状态、installation 与 Session seed smoke
 * [POS]: harness-plugin 的 T01/T06 组合验收入口，只写临时目录并断言同级 Harness 跟踪工作区始终干净
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const DEFAULT_HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const tgz = resolve(option('--tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-bundle-0.1.0.tgz')))
const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const keep = args.includes('--keep')
const home = await mkdtemp(resolve(tmpdir(), 'enterprise-t01-harness-'))

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

function pnpm(commandArgs, options = {}) {
  return run('corepack', ['pnpm@11.7.0', ...commandArgs], options)
}

async function waitForUrl(child, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Harness Web did not announce a URL\n${output}`)), timeoutMs)
    const inspect = (chunk) => {
      output += String(chunk)
      const match = output.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/)
      if (match?.[1] === undefined) return
      clearTimeout(timeout)
      resolvePromise({ url: match[1], output })
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`Harness Web exited before readiness (${String(code)})\n${output}`))
    })
  })
}

async function stop(child) {
  if (child.exitCode !== null) return
  const exited = new Promise(resolvePromise => child.once('exit', resolvePromise))
  child.kill('SIGINT')
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise(resolvePromise => setTimeout(() => resolvePromise(false), 10_000)),
  ])
  if (!graceful) {
    child.kill('SIGKILL')
    await exited
  }
}

let web
try {
  const harnessLock = JSON.parse(await readFile(
    resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'),
    'utf8',
  ))
  const harnessHead = (await run('git', ['rev-parse', 'HEAD'], {
    cwd: harnessRoot,
    env: process.env,
  })).stdout.trim()
  assert.equal(harnessHead, harnessLock.commit, 'Harness checkout does not match the product lock')
  const initialHarnessStatus = await run('git', ['status', '--porcelain'], {
    cwd: harnessRoot,
    env: process.env,
  })
  assert.equal(initialHarnessStatus.stdout, '', 'Harness checkout is dirty before the smoke')

  const consumer = resolve(home, 'consumer')
  await mkdir(consumer)
  await writeFile(resolve(consumer, 'package.json'), JSON.stringify({
    name: 'enterprise-t01-package-consumer',
    private: true,
    type: 'module',
  }, null, 2))
  await pnpm(['add', '--ignore-scripts', tgz], { cwd: consumer, env: process.env })
  await run(process.execPath, [
    '--input-type=module',
    '--eval',
    "const plugin = await import('@enterprise-agent/dsh-bundle'); if (typeof plugin.apply !== 'function') process.exit(2)",
  ], { cwd: consumer, env: process.env })

  const harnessEnv = { ...process.env, DSH_HOME: home }
  await pnpm(['--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', tgz], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  const dump = await pnpm(['--dir', harnessRoot, 'dsh', '--profile', 'web', '--dump-config'], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  assert.match(dump.stdout, /# == @enterprise-agent\/dsh-bundle/)
  assert.match(dump.stdout, /name: '@enterprise-agent\/dsh-bundle'/)

  const profilePatch = resolve(home, 'profiles', 'web', 'cordis.patch.yml')
  await writeFile(profilePatch, [
    '- id: enterprise-agent',
    '  config:',
    "    baseUrl: 'https://enterprise.example.invalid'",
    "    trustedPluginPublicKey: 'MCowBQYDK2VwAyEAgl6STzO84FyXlwmeHinWGgY/TgbGBUUBLF1xPT7SvT8='",
    '    enableTechnicalProbe: true',
    '',
  ].join('\n'))

  web = spawn('corepack', [
    'pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0',
  ], {
    cwd: harnessRoot,
    env: harnessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ready = await waitForUrl(web, 60_000)
  const status = await fetch(`${ready.url}/enterprise/api/v1/local/status`)
  assert.equal(status.status, 200)
  assert.deepEqual(await status.json(), {
    data: {
      state: 'SIGNED_OUT',
      bundleVersion: '0.1.0',
      platformUrl: 'https://enterprise.example.invalid',
      transport: 'webServer.register',
    },
  })

  const plugins = await fetch(`${ready.url}/enterprise/api/v1/local/plugins`)
  assert.equal(plugins.status, 200)
  assert.deepEqual(await plugins.json(), {
    data: {
      assignmentRevision: 0,
      plugins: [],
    },
  })

  const events = await fetch(`${ready.url}/enterprise/api/v1/local/events`)
  assert.equal(events.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  const eventReader = events.body.getReader()
  const firstEvent = new TextDecoder().decode((await eventReader.read()).value)
  assert.match(firstEvent, /event: status/)
  assert.match(firstEvent, /SIGNED_OUT/)
  assert.doesNotMatch(firstEvent, /token|authorization/i)
  await eventReader.cancel()

  let deviceText
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      deviceText = await readFile(resolve(home, 'enterprise', 'device.json'), 'utf8')
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await new Promise(resolvePromise => setTimeout(resolvePromise, 20))
    }
  }
  assert.ok(deviceText, 'platform-client did not create the installation file')
  const device = JSON.parse(deviceText)
  assert.match(device.installationId, /^[0-9a-f-]{36}$/i)
  assert.doesNotMatch(deviceText, /token|authorization|secret/i)

  const index = await (await fetch(ready.url)).text()
  assert.match(index, /@enterprise-agent\/dsh-bundle/)
  const clientUrl = index.match(/"url":"([^"]*enterprise-agent\/dsh-bundle\/client\.js[^"]*)"/)?.[1]
  assert.ok(clientUrl, 'boot manifest does not expose the enterprise Client bundle')
  const clientBundle = await (await fetch(new URL(clientUrl, ready.url))).text()
  assert.match(clientBundle, /window\.__ModuleLoader__\.load/)
  assert.doesNotMatch(clientBundle, /dsh-typert-protocol/)

  const copy = await fetch(`${ready.url}/enterprise/api/v1/local/session-copies`, {
    body: JSON.stringify({
      sourceSessionId: 'remote-t01-source',
      targetCwd: resolve(home, 'workspace'),
      events: [{ type: 'enterprise/t01-probe', seq: 0, time: 1, data: { ok: true }, ignorable: true }],
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  assert.equal(copy.status, 201)
  const copyBody = await copy.json()
  assert.equal(copyBody.data.sourceSessionId, 'remote-t01-source')
  assert.equal(copyBody.data.seedLength, 1)
  assert.match(copyBody.data.sessionId, /^enterprise-restored-/)

  await stop(web)
  web = undefined
  const harnessStatus = await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })
  assert.equal(harnessStatus.stdout, '')
  const profile = JSON.parse(await readFile(resolve(home, 'profiles', 'web', 'package.json'), 'utf8'))
  assert.ok(profile.dsh.profile.bundles.includes('@enterprise-agent/dsh-bundle'))

  process.stdout.write(`${JSON.stringify({
    clientBundle: clientUrl,
    harnessCommit: harnessHead,
    installationFile: 'non-secret',
    localEvents: 'passed',
    packageConsumer: 'passed',
    pluginStatusApi: 'passed',
    profile: 'web',
    sessionSeed: 'passed',
    statusApi: 'passed',
    temporaryDshHome: keep ? home : undefined,
  }, null, 2)}\n`)
} finally {
  if (web !== undefined) await stop(web)
  if (!keep) await rm(home, { force: true, recursive: true })
}
