/**
 * [INPUT]: 依赖随包 Node/Harness/pnpm、用户可写 DSH_HOME 与父进程 stdin 生命周期
 * [OUTPUT]: 离线初始化官方 web profile，经 stdout 交付带官方启动凭证的回环地址，退出时回收自己的 Host 进程组
 * [POS]: Pake 与官方 CLI 之间的启动边界；不修改官方 Web，不保存服务器地址或凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rename, symlink, readlink, unlink, open } from 'node:fs/promises'
import { dirname, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const runtime = dirname(fileURLToPath(import.meta.url))
const dshHome = process.env.DSH_HOME
if (!dshHome) throw new Error('DSH_HOME must be set by the desktop launcher')
process.umask(0o077)

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

const profile = join(dshHome, 'profiles', 'web')
await mkdir(join(profile, 'node_modules', '@deepseek-ai'), { recursive: true })
await mkdir(join(dshHome, 'workspace'), { recursive: true })
const installed = await readJson(join(runtime, 'package.json'))
const manifestPath = join(profile, 'package.json')
let manifest = await readJson(manifestPath)
const bundledNames = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'owndsh-plugin']
if (manifest === undefined) {
  const dependencies = {}
  for (const name of bundledNames) {
    dependencies[name] = (await readJson(join(runtime, 'node_modules', name, 'package.json'))).version
  }
  manifest = {
    name: 'owndsh-desktop-web', private: true, type: 'module',
    packageManager: `pnpm@${installed.dependencies.pnpm}`,
    dependencies,
    dsh: { profile: { bundles: bundledNames } },
  }
  await atomicJson(manifestPath, manifest)
}

// 仅维护桌面播种的链接；用户安装的真实目录、替换链接和显式卸载均归用户所有。
const seedPath = join(profile, '.owndsh-seed.json')
const previousSeed = await readJson(seedPath) ?? {}
const seed = { ...previousSeed }
for (const name of bundledNames) {
  if (!manifest.dependencies?.[name]) continue
  const path = join(profile, 'node_modules', name)
  const target = join(runtime, 'node_modules', name)
  let current
  try { current = await readlink(path) } catch (error) {
    if (error.code === 'EINVAL') continue
    if (error.code !== 'ENOENT') throw error
  }
  if (current !== undefined && current !== previousSeed[name]) continue
  if (current !== target) {
    if (current !== undefined) await unlink(path)
    await symlink(target, path, 'dir')
  }
  seed[name] = target
}
await atomicJson(seedPath, seed)

let loginPath = process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin'
const shell = process.env.SHELL
if (process.platform === 'darwin' && ['/bin/zsh', '/bin/bash'].includes(shell)) {
  try {
    const captured = execFileSync(shell, ['-ilc', '/usr/bin/printenv PATH'], {
      timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n').at(-1)
    if (captured) loginPath = captured
  } catch { /* 图形会话或 shell 配置不可用时保留系统 PATH。 */ }
}

const logPath = join(dshHome, 'desktop.log')
const log = await open(logPath, 'w', 0o600)
const child = spawn(join(runtime, 'bin', 'node'), [
  join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  'web', '--no-open', '--port', '0',
], {
  cwd: join(dshHome, 'workspace'),
  env: { ...process.env, DSH_HOME: dshHome, PATH: `${join(runtime, 'bin')}${delimiter}${loginPath}` },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stopping = false
let announced = false
let killTimer
const runtimeState = join(dshHome, 'desktop-runtime.json')
function signalGroup(signal) {
  if (!child.pid) return
  try { process.kill(-child.pid, signal) } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}
function stop() {
  if (stopping) return
  stopping = true
  signalGroup('SIGTERM')
  killTimer = setTimeout(() => signalGroup('SIGKILL'), 7000)
  killTimer.unref()
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
process.stdin.once('end', stop)
process.stdin.resume()

for (const stream of [child.stdout, child.stderr]) {
  const lines = createInterface({ input: stream })
  lines.on('line', line => {
    void log.write(`${line.replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[redacted]')}\n`).catch(() => {})
    const match = line.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)
    if (!announced && match) {
      announced = true
      void atomicJson(runtimeState, { pid: child.pid, launcherPid: process.pid, url: new URL(match[1]).origin })
        .then(() => process.stdout.write(`OWNDSH_READY ${match[1]}\n`))
        .catch(error => { process.stderr.write(`${error.message}\n`); stop() })
    }
  })
}

child.once('error', error => {
  process.stderr.write(`Harness failed to start: ${error.message}\n`)
  process.exitCode = 1
  process.stdin.destroy()
})
child.once('exit', async (code, signal) => {
  clearTimeout(killTimer)
  signalGroup('SIGKILL')
  const state = await readJson(runtimeState)
  if (state?.launcherPid === process.pid) await unlink(runtimeState).catch(() => {})
  await log.close()
  if (!stopping && (code !== 0 || !announced)) {
    process.stderr.write(`Harness exited (${code ?? signal}); see ${logPath}\n`)
  }
  process.exit(stopping ? 0 : code || 1)
})
