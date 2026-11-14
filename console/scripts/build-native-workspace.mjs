/**
 * [INPUT]: 依赖 native-runtime 锁定的官方 rc.3 CLI、Ego/Markdown 局部网络适配、独立临时 profile 和官方 Web assembly HTTP 接口。
 * [OUTPUT]: 生成包含官方预设选择与会话模式标识的无凭据原生工作区静态资源、精确 URL 映射及构建元数据；释放构建 Host 并保留退出码或信号错误。
 * [POS]: Console 的原生 UI 构建边界；插件代码由固定制品供应，工作区 HTML 文档由原生隔离预览承载。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EGO_FACTORY, patchEgoClient } from './ego-client.mjs'
import { MARKDOWN_FACTORY, MARKDOWN_SOURCE_SHA256, patchSessionMarkdownClient } from './session-markdown-client.mjs'

const consoleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = '0.2.2-rc.3'
const output = join(consoleRoot, 'public/native-workspace')
const runtime = createRequire(join(consoleRoot, 'native-runtime/package.json'))
const cliManifestPath = runtime.resolve('@deepseek-ai/dsh/package.json')
const official = createRequire(cliManifestPath)
assert.equal(JSON.parse(await readFile(cliManifestPath, 'utf8')).version, version)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const shellSourceHash = '65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b'
const conversationSourceHash = '3d166eab312749bf8c528dd7d26d95340df75a27fec668b3510e4558fe9b343b'
const previewSourceHash = 'f4c84ba525e3593c3f9ad1fc19f821fce3ff381320f9e27746fc441d12ce25fd'
assert.equal(hash(await readFile(official.resolve('@deepseek-ai/dsh-client-ui-conversation/client'))), conversationSourceHash)
assert.equal(hash(await readFile(official.resolve('@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'))), previewSourceHash)
const egoSource = await readFile(runtime.resolve('dsh-ego-browser/client'))
const egoClient = patchEgoClient(egoSource)
const markdownSource = await readFile(official.resolve('@deepseek-ai/dsh-session-log-export/client'))
const markdownClient = patchSessionMarkdownClient(markdownSource)

const temp = await mkdtemp(join(tmpdir(), 'owndsh-native-assembly-'))
const resources = {}
const metadata = {}
let child
let cookie = ''
let origin = ''
let shellPatches = 0
let intakePatches = 0
let markdownPatches = 0

async function saveResource(path, bytes, contentType) {
  const extension = extname(path.split('?')[0]) || (contentType.includes('javascript') ? '.js' : '.bin')
  const digest = hash(bytes)
  const file = `/native-workspace/assets/${digest}${extension}`
  await writeFile(join(consoleRoot, 'public', file), bytes)
  resources[path] = { file, sha256: digest, contentType }
}
async function fetchResource(path) {
  if (resources[path]) return
  const url = new URL(path, origin)
  assert.equal(url.origin, origin, '禁止从第三方来源采集原生代码')
  const response = await fetch(url, { headers: { cookie, 'accept-encoding': 'identity' }, redirect: 'error' })
  assert.equal(response.status, 200, `原生资源未就绪: ${path}`)
  let bytes = Buffer.from(await response.arrayBuffer())
  if (path.startsWith('/plugins/') && bytes.includes(Buffer.from(EGO_FACTORY))) {
    const original = egoSource.toString('utf8').replace(/\n?\/\/# sourceMappingURL=.*\s*$/, '')
    const text = bytes.toString('utf8')
    assert.equal(text.split(original).length, 2, 'Ego 聚合资源必须包含完整的固定客户端')
    bytes = Buffer.from(text.replace(original, egoClient.toString('utf8')))
  }
  if (path.startsWith('/plugins/') && bytes.includes(Buffer.from(MARKDOWN_FACTORY))) {
    const original = markdownSource.toString('utf8').replace(/\n?\/\/# sourceMappingURL=.*\s*$/, '')
    const text = bytes.toString('utf8')
    assert.equal(text.split(original).length, 2, 'Markdown 聚合资源必须包含完整的固定客户端')
    bytes = Buffer.from(text.replace(original, markdownClient.toString('utf8')))
    markdownPatches++
  }
  if (path.startsWith('/plugins/') && bytes.includes(Buffer.from('addFiles:(files,directories='))) {
    const source = bytes.toString('utf8')
    const intake = /addFiles:\(files,directories=new Set\)=>\{[\s\S]*?\},removeAttachment:/g
    assert.equal([...source.matchAll(intake)].length, 1, '文件 intake 已变化，必须重新核验禁用上传的接缝')
    bytes = Buffer.from(source.replace(intake, 'addFiles:void 0,removeAttachment:'))
    intakePatches++
  }
  await saveResource(path, bytes, response.headers.get('content-type') ?? 'application/octet-stream')
}
async function filesUnder(directory, prefix = '') {
  const result = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isDirectory()) result.push(...await filesUnder(join(directory, item.name), prefix + item.name + '/'))
    else if (item.isFile()) result.push(prefix + item.name)
  }
  return result
}

try {
  await mkdir(join(output, 'assets'), { recursive: true })
  const profile = join(temp, 'home/profiles/web')
  await mkdir(profile, { recursive: true })
  // 只裁剪未开放的 UI 入口，保留原生会话、审批、工作区和文件预览依赖。
  const disabled = ['product-analytics', 'client-hmr', 'ui-open-in-app', 'ui-settings-account',
    'ui-settings-models', 'ui-settings-plugin-inventory', 'ui-cordis',
    'ui-sidebar-browser', 'ui-message-feedback', 'ui-deliverables',
    'directory-picker', 'ui-directory-picker-browse', 'ui-directory-picker-native',
    'ui-settings-general',
    'ui-settings-session-log', 'ui-settings-plugins', 'ui-settings-shell',
    'ui-settings-agent-loop', 'ui-settings-subagent', 'ui-settings-web-search']
  await writeFile(join(profile, 'cordis.patch.yml'), disabled.map(id => `- id: ${id}\n  disabled: true\n`).join('')
    + "- insert:\n    - id: ui-plugin-market\n      name: '@deepseek-ai/dsh-client-ui-plugin-market'\n")
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-ego-browser': '0.9.14' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-ego-browser'] } } }))
  await mkdir(join(profile, 'node_modules'), { recursive: true })
  const { symlink } = await import('node:fs/promises')
  await symlink(dirname(runtime.resolve('dsh-ego-browser/package.json')), join(profile, 'node_modules/dsh-ego-browser'), 'dir')
  child = spawn(process.execPath, [join(dirname(cliManifestPath), 'lib/bin.js'), '--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: temp,
    env: { ...process.env, DSH_HOME: join(temp, 'home'), DSH_AGENTS_HOME: join(temp, 'agents'),
      DSH_TELEMETRY_DISABLED: '1', SSH_TTY: 'owndsh-native-build' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const launch = await new Promise((resolveLaunch, reject) => {
    let text = ''
    const timer = setTimeout(() => reject(new Error('原生 UI 构建 Host 启动超时')), 90_000)
    const consume = chunk => {
      text = (text + chunk.toString()).slice(-128_000)
      const match = text.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)
      if (match) { clearTimeout(timer); resolveLaunch(match[1]) }
    }
    child.stdout.on('data', consume)
    child.stderr.on('data', consume)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      reject(new Error(`原生 UI 构建 Host 退出 ${code ?? signal}: ${text.replace(/([?&]token=)[^\s"<>]+/g, '$1[redacted]').slice(-6000)}`))
    })
  })
  origin = new URL(launch).origin
  const admitted = await fetch(launch, { redirect: 'manual' })
  cookie = admitted.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cookie, '构建 Host 必须建立 owner 会话')
  const response = await fetch(origin, { headers: { cookie } })
  assert.equal(response.status, 200)
  const html = await response.text()
  const graphMatch = html.match(/<script>globalThis\["__DSH_BOOT__"\] = ([\s\S]*?)<\/script>/)
  assert.ok(graphMatch, '缺少官方 boot graph')
  const graph = JSON.parse(graphMatch[1])
  assert.ok(Array.isArray(graph.entries) && Array.isArray(graph.batches))
  for (const name of ['ui-plugin-manager', 'ui-plugin-market', 'ui-schedule', 'ui-entry-customization', 'ui-agent-preset']) {
    assert.ok(graph.entries.some(row => row.id === `@deepseek-ai/dsh-client-${name}`), `原生导航模块缺失: ${name}`)
  }
  for (const row of [...graph.entries, ...graph.batches]) await fetchResource(new URL(row.url, origin).pathname + new URL(row.url, origin).search)
  for (const row of graph.entries) {
    const packageName = row.id
    let clientPath
    try { clientPath = official.resolve(`${packageName}/client`) } catch { continue }
    const packageRoot = dirname(official.resolve(`${packageName}/package.json`))
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    if (manifest.exports?.['./assets/*'] !== undefined) {
      assert.equal(manifest.exports['./assets/*'], './lib/assets/*', '官方包资源导出边界已变化')
      for (const asset of await filesUnder(join(packageRoot, 'lib/assets'))) {
        const encoded = asset.split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')
        await fetchResource(`/plugins/${packageName}/assets/${encoded}`)
      }
    }
    for (const file of await readdir(dirname(clientPath))) {
      if (/^client\..+\.js$/.test(file) && !file.startsWith('client.node.')) {
        const entryUrl = new URL(row.url, origin)
        const rev = entryUrl.searchParams.get('rev')
        await fetchResource(`/plugins/${packageName}/${file}${rev ? `?rev=${rev}` : ''}`)
      }
    }
  }
  const frontendManifest = official.resolve('@deepseek-ai/dsh-web-frontend/package.json')
  const dist = join(dirname(frontendManifest), 'dist')
  for (const file of await filesUnder(dist)) {
    if (file === 'index.html' || file.endsWith('.map')) continue
    let bytes = await readFile(join(dist, file))
    if (file === 'assets/index-Ciz7DZxv.js') {
      shellPatches++
      assert.equal(hash(bytes), shellSourceHash, '官方 Web 入口已变化，必须重新核验启动回调接缝')
      const source = bytes.toString('utf8')
      const bootCall = 't.run(Ma===void 0?void 0:c9)'
      assert.equal(source.split(bootCall).length, 2)
      const imageFunction = 'function lK({src:e,alt:t,destination:r,preview:i}){'
      assert.equal(source.split(imageFunction).length, 2, 'Markdown 图片组件已变化，必须重新核验远端媒体接缝')
      const hoverFunction = 'function WW({src:e,alt:t,loadingLabel:r,failedLabel:i}){'
      assert.equal(source.split(hoverFunction).length, 2, '悬停图片组件已变化，必须重新核验远端媒体接缝')
      const imageHook = 'function owndshUseImage(input){const[state,setState]=x.useState();x.useEffect(()=>{const abort=new AbortController();let media;globalThis.__OWNDSH_NATIVE_IMAGE__(input,abort.signal).then(value=>{if(abort.signal.aborted){value.dispose();return}media=value;setState({input,url:value.url})},()=>{if(!abort.signal.aborted)setState({input,failed:true})});return()=>{abort.abort();media?.dispose()}},[input]);return state?.input===input?state:{}}'
      const imagePatch = imageHook + 'function lK({src:remoteSrc,alt:t,destination:r,preview:i}){const{url:e,failed}=owndshUseImage(remoteSrc);if(!e)return m.jsx("span",{className:Lt.imageAlt,children:failed?(i?.labels.failed??t):(i?.labels.loading??t)});return m.jsx(owndshLoadedImage,{src:e,alt:t,destination:r,preview:i})}function owndshLoadedImage({src:e,alt:t,destination:r,preview:i}){'
      const hoverPatch = 'function WW({src:remoteSrc,alt:t,loadingLabel:r,failedLabel:i}){const{url:e,failed}=owndshUseImage(remoteSrc);if(!e)return m.jsx("span",{className:Q0.status,role:"status",children:failed?i:r});return m.jsx(owndshLoadedPreview,{src:e,alt:t,loadingLabel:r,failedLabel:i})}function owndshLoadedPreview({src:e,alt:t,loadingLabel:r,failedLabel:i}){'
      bytes = Buffer.from(source.replace(imageFunction, imagePatch).replace(hoverFunction, hoverPatch).replace(bootCall,
        't.run(e=>globalThis.__OWNDSH_NATIVE_BOOT_FAILED__?.(e)).then(()=>globalThis.__OWNDSH_NATIVE_BOOT__?.())'))
    }
    const types = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
    // dist 的相对 import/url 需要保留相邻路径，主脚本仍通过资源表选择。
    await mkdir(dirname(join(output, 'dist', file)), { recursive: true })
    await writeFile(join(output, 'dist', file), bytes)
    resources['/' + file] = { file: `/native-workspace/dist/${file}`, sha256: hash(bytes), contentType: types[extname(file)] ?? 'application/octet-stream' }
  }
  assert.equal(shellPatches, 1, '官方 shell 接缝必须恰好应用一次')
  assert.ok(intakePatches > 0, '官方文件 intake 接缝必须覆盖冻结的聚合与独立资源')
  assert.ok(markdownPatches > 0, 'Markdown 复制接缝必须覆盖冻结资源')
  for (const path of ['/api/settings/describe', '/api/dynamicCordisRunner/syncInspectManifest', '/api/dynamicCordisRunner/inventory']) {
    const args = path.endsWith('/syncInspectManifest') ? { providers: [] } : {}
    const response = await fetch(origin + path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', method: path.slice(5), payload: { args }, rpcId: randomUUID() }) })
    assert.equal(response.status, 200, `assembly metadata: ${path}`)
    metadata[path] = await response.json()
    assert.equal(metadata[path].result?.ok, true, `assembly metadata RPC: ${path}: ${JSON.stringify(metadata[path].result).slice(0, 1500)}`)
  }
  const assembly = { harnessVersion: version, html, resources, metadata, patches: { shellSourceSha256: shellSourceHash, conversationSourceSha256: conversationSourceHash, previewSourceSha256: previewSourceHash, markdownSourceSha256: MARKDOWN_SOURCE_SHA256 } }
  const serialized = JSON.stringify(assembly)
  assert.ok(!serialized.includes(cookie), '生成产物不得包含 owner 凭据')
  assert.ok(!serialized.includes(origin), '生成产物不得包含构建 Host 地址')
  await writeFile(join(output, 'assembly.json'), serialized + '\n')
  await writeFile(join(output, 'LICENSE'), await readFile(join(consoleRoot, 'DSH_LICENSE')))
  await writeFile(join(output, 'EGO_LICENSE'), await readFile(join(consoleRoot, 'EGO_LICENSE')))
  const retained = new Set(Object.values(resources).map(resource => resource.file.slice('/native-workspace/'.length)))
  for (const directory of ['assets', 'dist']) {
    for (const file of await filesUnder(join(output, directory))) {
      if (!retained.has(`${directory}/${file}`)) await rm(join(output, directory, file))
    }
  }
  process.stdout.write(`原生 DSH ${version}: ${graph.entries.length} 个客户端模块，${Object.keys(resources).length} 个固定资源。\n`)
} finally {
  cookie = ''
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolveExit => child.once('exit', resolveExit))
    child.kill('SIGTERM')
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(killTimer)
  }
  await rm(temp, { recursive: true, force: true })
}
