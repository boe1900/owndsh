/**
 * [INPUT]: 依赖同级锁定 Harness built dsh、Corepack pnpm 与两个预构建测试 bundle tgz
 * [OUTPUT]: 验证 enterprise profile 的 add --save-exact、旧版本回滚、remove、bundle reconcile 与上游清洁度
 * [POS]: plugin T14 真实 CLI 验收器，只操作带空格的临时制品路径和临时 DSH_HOME
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const DEFAULT_HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const keep = args.includes('--keep')
const root = await mkdtemp(resolve(tmpdir(), 'enterprise-t14-dsh-'))
const dshHome = resolve(root, 'dsh home')
const artifactRoot = resolve(root, 'artifacts with spaces')
const packageName = '@example/enterprise-managed-smoke'

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

async function pack(version) {
  const source = resolve(root, `fixture-${version}`)
  const destination = resolve(artifactRoot, version)
  await mkdir(destination, { recursive: true })
  await mkdir(source)
  await writeFile(resolve(source, 'package.json'), JSON.stringify({
    name: packageName,
    version,
    type: 'module',
    main: 'index.js',
    files: ['index.js', 'cordis.patch.yml'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  await writeFile(resolve(source, 'index.js'), [
    `export const version = ${JSON.stringify(version)}`,
    'export function apply() {}',
    '',
  ].join('\n'))
  await writeFile(resolve(source, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: enterprise-managed-smoke',
    `      name: '${packageName}'`,
    '',
  ].join('\n'))
  await run('corepack', ['pnpm@11.7.0', 'pack', '--pack-destination', destination], {
    cwd: source,
    env: process.env,
  })
  const files = (await readdir(destination)).filter(file => file.endsWith('.tgz'))
  assert.equal(files.length, 1)
  return resolve(destination, files[0])
}

try {
  const lock = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'), 'utf8'))
  const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, env: process.env })).stdout.trim()
  assert.equal(head, lock.commit)
  assert.equal((await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })).stdout, '')

  const dsh = resolve(harnessRoot, 'apps', 'cli', 'lib', 'bin.js')
  const v1 = await pack('1.0.0')
  const v2 = await pack('2.0.0')
  const env = { ...process.env, DSH_HOME: dshHome }
  const plugin = (...pluginArgs) => run(dsh, ['plugin', '--profile', 'enterprise', ...pluginArgs], {
    cwd: harnessRoot,
    env,
  })
  const profileDir = resolve(dshHome, 'profiles', 'enterprise')
  const installedManifest = () => readFile(
    resolve(profileDir, 'node_modules', '@example', 'enterprise-managed-smoke', 'package.json'), 'utf8',
  ).then(JSON.parse)

  await plugin('add', '--ignore-scripts', '--save-exact', v2)
  assert.equal((await installedManifest()).version, '2.0.0')
  let profile = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'))
  assert.ok(profile.dsh.profile.bundles.includes(packageName))
  assert.ok(profile.dependencies[packageName].includes('enterprise-managed-smoke-2.0.0.tgz'))

  await plugin('add', '--ignore-scripts', '--save-exact', v1)
  assert.equal((await installedManifest()).version, '1.0.0')
  profile = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'))
  assert.ok(profile.dependencies[packageName].includes('enterprise-managed-smoke-1.0.0.tgz'))
  const dump = await run(dsh, ['--profile', 'enterprise', '--dump-config'], { cwd: harnessRoot, env })
  assert.match(dump.stdout, /id: enterprise-managed-smoke/)

  await plugin('remove', packageName)
  profile = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'))
  assert.equal(profile.dependencies?.[packageName], undefined)
  assert.equal(profile.dsh.profile.bundles.includes(packageName), false)
  assert.equal((await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })).stdout, '')

  process.stdout.write(`${JSON.stringify({
    artifactPathWithSpaces: 'passed',
    exactAdd: '2.0.0',
    harnessCommit: head,
    profile: 'enterprise',
    remove: 'passed',
    rollback: '1.0.0',
    temporaryRoot: keep ? root : undefined,
  }, null, 2)}\n`)
} finally {
  if (!keep) await rm(root, { force: true, recursive: true })
}
