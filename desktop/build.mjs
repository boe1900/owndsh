/**
 * [INPUT]: 依赖锁定 Pake 源码及 sharp、官方 Harness 运行树、OwnDsh 品牌图/tgz 与本机 Node/Rust 工具链
 * [OUTPUT]: 生成含圆角图标、模板托盘和离线运行环境的 app/DMG，并记录版本和插件 hash
 * [POS]: desktop 的唯一发行编排器，只在 .build/dist 生成第三方副本，不修改上游 checkout
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdir, readFile, writeFile, chmod, rm, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const project = resolve(root, '..')
const stage = join(root, '.build', 'pake')
const tauriRoot = join(stage, 'src-tauri')
const runtime = join(stage, 'runtime')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const sharp = createRequire(join(root, 'node_modules/pake-cli/package.json'))('sharp')
const run = (file, args, cwd = root) => execFileSync(file, args, { cwd, stdio: 'inherit' })
const json = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
assert.equal(process.platform, 'darwin', 'This delivery builds macOS packages; Windows/Linux require their own native validation')
assert.equal(process.version, 'v24.14.1', 'Build with Node 24.14.1 so the embedded runtime is reproducible')

await mkdir(stage, { recursive: true })
await cp(join(root, 'node_modules', 'pake-cli', 'src-tauri'), tauriRoot, { recursive: true, verbatimSymlinks: true })
await rm(runtime, { recursive: true, force: true })
await mkdir(runtime, { recursive: true })
await cp(join(root, 'runtime', 'node_modules'), join(runtime, 'node_modules'), { recursive: true, verbatimSymlinks: true })
await cp(join(root, 'runtime', 'package.json'), join(runtime, 'package.json'))
await cp(join(root, 'runtime', 'package-lock.json'), join(runtime, 'package-lock.json'))
await cp(join(root, 'launcher.mjs'), join(runtime, 'launcher.mjs'))
await mkdir(join(runtime, 'bin'), { recursive: true })
await cp(process.execPath, join(runtime, 'bin', 'node'))
await chmod(join(runtime, 'bin', 'node'), 0o755)
await cp(resolve(dirname(process.execPath), '..', 'LICENSE'), join(runtime, 'NODE-LICENSE'))

for (const [name, entry] of [
  ['dsh', '@deepseek-ai/dsh/lib/bin.js'],
  ['pnpm', 'pnpm/bin/pnpm.cjs'],
]) {
  await writeFile(join(runtime, 'bin', name), [
    '#!/bin/sh',
    'runtime_bin=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `exec "$runtime_bin/node" "$runtime_bin/../node_modules/${entry}" "$@"`,
    '',
  ].join('\n'), { mode: 0o755 })
  await chmod(join(runtime, 'bin', name), 0o755)
}

const pluginManifest = JSON.parse(await readFile(join(project, 'plugin/packages/bundle/package.json'), 'utf8'))
const artifact = join(project, 'artifacts', `owndsh-plugin-${pluginManifest.version}.tgz`)
const pluginDir = join(runtime, 'node_modules', 'owndsh-plugin')
await rm(pluginDir, { recursive: true, force: true })
await mkdir(pluginDir, { recursive: true })
run('tar', ['-xzf', artifact, '--strip-components=1', '-C', pluginDir])
await json(join(runtime, 'build-info.json'), {
  app: manifest.version,
  pake: manifest.devDependencies['pake-cli'],
  harness: JSON.parse(await readFile(join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  plugin: pluginManifest.version,
  pluginSha256: createHash('sha256').update(await readFile(artifact)).digest('hex'),
})

await cp(join(root, 'host.rs'), join(tauriRoot, 'src', 'host.rs'))
let rust = await readFile(join(tauriRoot, 'src', 'lib.rs'), 'utf8')
const replacements = [
  ['mod app;\n', 'mod app;\nmod host;\n'],
  ['.setup(move |app| {', `.setup(move |app| {
            let host = host::HarnessProcess::start(app)?;
            let mut pake_config = pake_config.clone();
            pake_config.windows[0].url = host.url.clone();
            pake_config.system_tray_path = app.path().resource_dir()?.join("tray.png").to_string_lossy().into_owned();
            app.manage(host);`],
  ['.run(move |_app, _event| {', `.run(move |_app, _event| {
            if matches!(_event, tauri::RunEvent::ExitRequested { .. }) {
                if let Some(host) = _app.try_state::<host::HarnessProcess>() {
                    host.stop();
                }
            }`],
]
for (const [before, after] of replacements) {
  assert.equal(rust.split(before).length, 2, `Pake hook changed: ${before}`)
  rust = rust.replace(before, after)
}
await writeFile(join(tauriRoot, 'src', 'lib.rs'), rust)

const setupPath = join(tauriRoot, 'src/app/setup.rs')
let setup = await readFile(setupPath, 'utf8')
for (const [before, after] of [
  ['.menu(&menu)', '.menu(&menu)\n        .tooltip("OwnDsh")\n        .show_menu_on_left_click(false)'],
  ['tray.set_icon_as_template(false)?;', 'tray.set_icon_as_template(true)?;'],
  ['"hide_app", "Hide"', '"hide_app", "隐藏窗口"'],
  ['"show_app", "Show"', '"show_app", "显示 OwnDsh"'],
  ['"quit", "Quit"', '"quit", "退出 OwnDsh"'],
]) {
  assert.equal(setup.split(before).length, 2, `Pake tray hook changed: ${before}`)
  setup = setup.replace(before, after)
}
await writeFile(setupPath, setup)

const pake = JSON.parse(await readFile(join(tauriRoot, 'pake.json'), 'utf8'))
Object.assign(pake.windows[0], {
  url: 'http://127.0.0.1', url_type: 'web', title: 'OwnDsh',
  width: 1400, height: 900, hide_title_bar: false, hide_on_close: true,
})
pake.system_tray = { macos: true, windows: false, linux: false }
await json(join(tauriRoot, 'pake.json'), pake)
await mkdir(join(stage, 'dist'), { recursive: true })
await writeFile(join(stage, 'dist', 'index.html'), '<!doctype html><html><head><title>OwnDsh</title></head><body></body></html>\n')
await json(join(stage, 'package.json'), { name: 'owndsh-pake-build', version: manifest.version, private: true })

const tauri = join(root, 'node_modules', '.bin', 'tauri')
const brandIcon = join(project, 'console/public/owndsh-whale-mono-m2.png')
const appIcon = join(stage, 'icon-macos.png')
// 沿用 Pake 3.16.1 的 macOS mask 尺寸；CLI 未导出该图像处理函数。
const mask = Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" rx="224" fill="white"/></svg>')
const rounded = await sharp(brandIcon).resize(1024, 1024).ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
await sharp(rounded).resize(840, 840)
  .extend({ top: 92, bottom: 92, left: 92, right: 92, background: '#00000000' }).png().toFile(appIcon)
run(tauri, ['icon', appIcon, '--output', join(tauriRoot, 'icons')])
// 黑底白图的亮度直接转为 alpha，让 macOS 自动适配明暗菜单栏。
const silhouette = await sharp(brandIcon).resize(32, 32).greyscale().raw().toBuffer()
const trayPixels = Buffer.alloc(32 * 32 * 4)
silhouette.forEach((alpha, index) => { trayPixels[index * 4 + 3] = alpha })
await sharp(trayPixels, { raw: { width: 32, height: 32, channels: 4 } })
  .extend({ top: 2, bottom: 2, left: 2, right: 2, background: '#00000000' })
  .png().toFile(join(tauriRoot, 'icons/tray.png'))
const config = JSON.parse(await readFile(join(tauriRoot, 'tauri.conf.json'), 'utf8'))
Object.assign(config, { productName: 'OwnDsh', identifier: 'com.owndsh.desktop', version: manifest.version })
config.app.trayIcon = undefined
config.bundle = {
  active: true, targets: ['app'],
  icon: ['icons/icon.icns'],
  resources: { '../runtime/': 'runtime/', 'icons/tray.png': 'tray.png' },
  copyright: 'OwnDsh contributors. Desktop shell based on Pake (GPL-3.0-or-later).',
  shortDescription: 'DeepSeek Harness with OwnDsh',
  macOS: { minimumSystemVersion: '13.5', signingIdentity: '-', infoPlist: 'Info.plist' },
}
await json(join(tauriRoot, 'tauri.conf.json'), config)
const capabilityPath = join(tauriRoot, 'capabilities', 'default.json')
const capability = JSON.parse(await readFile(capabilityPath, 'utf8'))
capability.remote.urls = ['http://127.0.0.1:*']
await json(capabilityPath, capability)
// 平台配置同样参与 Tauri merge，清空上游示例应用的 bundle 元数据。
await json(join(tauriRoot, 'tauri.macos.conf.json'), {})
await cp(join(root, 'node_modules/pake-cli/LICENSE'), join(runtime, 'PAKE-LICENSE'))
await cp(join(root, 'node_modules/pake-cli/LICENSE-EXCEPTION'), join(runtime, 'PAKE-LICENSE-EXCEPTION'))

process.stdout.write(`Prepared ${runtime}\n`)
if (!process.argv.includes('--prepare-only')) {
  run(tauri, ['build', '--bundles', 'app'], stage)
  const output = join(root, 'dist')
  await mkdir(output, { recursive: true })
  const app = join(output, 'OwnDsh.app')
  await rm(app, { recursive: true, force: true })
  await cp(join(tauriRoot, 'target/release/bundle/macos/OwnDsh.app'), app, { recursive: true, verbatimSymlinks: true })
  const imageRoot = join(root, '.build', 'dmg')
  await rm(imageRoot, { recursive: true, force: true })
  await mkdir(imageRoot, { recursive: true })
  await symlink('/Applications', join(imageRoot, 'Applications'))
  await cp(app, join(imageRoot, 'OwnDsh.app'), { recursive: true, verbatimSymlinks: true })
  const dmg = join(output, `OwnDsh-${manifest.version}-macos-${process.arch}.dmg`)
  run('hdiutil', ['create', '-volname', 'OwnDsh', '-srcfolder', imageRoot, '-ov', '-format', 'UDZO', dmg])
  process.stdout.write(`Built ${app}\nBuilt ${dmg}\n`)
}
