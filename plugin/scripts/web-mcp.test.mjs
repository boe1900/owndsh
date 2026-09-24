/**
 * [INPUT]: npm Harness Web runtime、已安装 OwnDsh 的隔离 profile、Playwright 与本地 HTTP 协议桩。
 * [OUTPUT]: 浏览器登录/MCP 操作和真实 AgentLoop 的搜索累加、Orama golden 召回、释放、资源、SDK OAuth 回归证据。
 * [POS]: 跨版本组合验收；复制 profile 后运行，模型只返回确定性工具调用，所有外部服务均在回环地址。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'

const runtime = process.env.OWNDSH_TEST_RUNTIME
const profile = process.env.OWNDSH_TEST_PROFILE
assert.ok(runtime && profile, 'Set OWNDSH_TEST_RUNTIME and OWNDSH_TEST_PROFILE (installed web profile directory)')
const requireRuntime = createRequire(join(runtime, 'package.json'))
const hash = value => createHash('sha256').update(value).digest('hex')
const bundleHash = hash(await readFile(join(profile, 'node_modules/owndsh-plugin/lib/index.js')))
assert.equal(bundleHash, hash(await readFile(new URL('../packages/bundle/lib/index.js', import.meta.url))), 'Installed profile must contain the current built bundle')
const manifest = requireRuntime('@deepseek-ai/dsh/package.json')
assert.equal(manifest.version, '0.1.7-rc.1')
const dshEntry = join(dirname(requireRuntime.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js')
const { chromium } = await import(process.env.OWNDSH_PLAYWRIGHT_MODULE ?? 'playwright')
const home = await mkdtemp(join(tmpdir(), 'owndsh-web-mcp-'))
const evidence = resolve(process.env.OWNDSH_E2E_OUTPUT ?? 'scripts/.build/web-mcp')
await mkdir(evidence, { recursive: true })
await cp(profile, join(home, 'profiles/web'), { recursive: true })
await mkdir(join(home, 'workspace'))
await mkdir(join(home, 'opener'))
const authorizeFile = join(home, 'authorize-url')
for (const name of ['open', 'xdg-open']) await writeFile(join(home, 'opener', name),
  '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.OWNDSH_AUTH_URL_FILE, process.argv.at(-1))\n', { mode: 0o700 })

const requestId = `req_${'0'.repeat(26)}`
const json = (res, value, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
const bodyText = async req => { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks).toString() }
const body = async req => JSON.parse(await bodyText(req))
const errors = [], methods = [], modelRequests = [], oauthEvents = [], checks = []
const codes = new Map()
let origin, installationId, refreshGrant, mcpAccess, mcpRefresh, tokenIndex = 0, rejectedAccess, rejectRefresh = false
let scenario = 'load', step = 0
const tool = (name, description = `${name} for E2E`) => ({ name, description, inputSchema: { type: 'object', properties: { text: { type: 'string' } } } })
const goldenTools = [
  tool('fetch', 'Fetch workspace information, the current workspace name, a page, or a database by ID；查询当前工作区名称。'),
  tool('get-users', 'List users and workspace members for the current workspace；列出当前工作区用户。'),
  tool('create-page', 'Create a page in a workspace or in a database.'),
  tool('update-page', 'Update page properties and content in a workspace.'),
  tool('query-data-source', 'Query rows from a data source or database.'),
  tool('retrieve-a-block', 'Retrieve a block and its content from a workspace page.'),
  tool('append-block-children', 'Append block children to a page in a workspace.'),
  tool('create-database', 'Create a database in a workspace and configure its properties.'),
  tool('utility-alpha', 'Maintenance helper.'),
  tool('utility-bravo', 'Maintenance helper.'),
  tool('utility-charlie', 'Maintenance helper.'),
]
const assignment = (id, name, auth, displayName = name) => ({ id, revision: 1, serverName: name, displayName, description: 'Web E2E',
  transport: 'streamable-http', url: `${origin}/${name}`, allowInsecureTransport: true, headers: {}, auth,
  toolCallTimeoutMs: 5000, reconnect: { enabled: false, initialDelayMs: 100, maxDelayMs: 1000, maxAttempts: 1 }, presentation: 'search' })
function assignments() {
  return [assignment('1', 'docs', { type: 'none' }), assignment('2', 'resourceonly', { type: 'none' }),
    assignment('3', 'oauth', { type: 'oauth', issuer: origin, resource: `${origin}/oauth`, clientId: 'e2e', scopes: ['read'] }),
    assignment('4', 'apikey', { type: 'api-key', headerName: 'X-API-Key' }), assignment('5', 'golden', { type: 'none' }, 'Notion')]
}
const tc = (name, args = {}) => ({ name, arguments: JSON.stringify(args) })
function modelResponse(input) {
  const names = input.tools?.map(t => t.function.name) ?? []
  const active = names.filter(n => n.startsWith('mcp__'))
  modelRequests.push({ scenario, step, names: active, toolResults: input.messages.filter(m => m.role === 'tool') })
  assert.equal(new Set(names).size, names.length)
  for (const name of ['mcp_tool_search', 'mcp_tool_release', 'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']) assert.ok(names.includes(name), name)
  const expectNames = expected => assert.deepEqual(active.sort(), expected.sort(), `${scenario} step ${step}`)
  if (scenario === 'load') {
    switch (step++) {
      case 0: expectNames([]); return [tc('mcp_tool_search', { query: 'echo', serverName: 'docs' })]
      case 1: expectNames(['mcp__docs__echo']); return [tc('mcp_tool_search', { query: 'write', serverName: 'docs' }), tc('mcp__docs__echo', { text: 'first' })]
      case 2: expectNames(['mcp__docs__echo', 'mcp__docs__write']); return [tc('mcp_tool_search', { query: 'echo', serverName: 'docs' })]
      case 3: expectNames(['mcp__docs__echo', 'mcp__docs__write']); return [tc('mcp_tool_release', { names: ['mcp__docs__echo'] }), tc('mcp__docs__echo', { text: 'same-step' })]
      case 4: expectNames(['mcp__docs__write']); return [tc('mcp__docs__write', { text: 'last' }), tc('mcp_tool_search', { query: 'echo', serverName: 'oauth' })]
      case 5: expectNames(['mcp__docs__write', 'mcp__oauth__echo']); return [tc('mcp__oauth__echo', { text: 'oauth' }), tc('mcp_tool_search', { query: 'echo', serverName: 'apikey' })]
      case 6: expectNames(['mcp__docs__write', 'mcp__oauth__echo', 'mcp__apikey__echo']); return [tc('mcp__apikey__echo', { text: 'key' }),
        tc('list_mcp_resources', { server: 'resourceonly' }), tc('list_mcp_resource_templates', { server: 'resourceonly' }),
        tc('read_mcp_resource', { server: 'resourceonly', uri: 'mcp://docs/readme' }),
        tc('list_mcp_resources', { server: 'oauth' }), tc('list_mcp_resource_templates', { server: 'oauth' }),
        tc('read_mcp_resource', { server: 'oauth', uri: 'mcp://docs/from-template' })]
      case 7:
        assert.ok(input.messages.some(m => m.role === 'tool' && JSON.stringify(m.content).includes('resource body')))
        return 'MCP E2E load PASS'
      default: throw new Error('Unexpected model loop')
    }
  }
  if (scenario === 'refresh') {
    if (step++ === 0) return [tc('mcp__oauth__echo', { text: 'refresh' })]
    assert.ok(input.messages.some(m => m.role === 'tool' && JSON.stringify(m.content).includes('echo result')))
    return 'MCP E2E refresh PASS'
  }
  if (scenario === 'invalid-grant') {
    if (step++ === 0) return [tc('mcp__oauth__echo', { text: 'must-not-execute' })]
    return 'MCP E2E invalid-grant PASS'
  }
  if (scenario === 'recover') {
    if (step++ === 0) return [tc('mcp_tool_search', { query: 'echo', serverName: 'oauth' })]
    if (step === 2) return [tc('mcp__oauth__echo', { text: 'reauthorized' })]
    return 'MCP E2E recovery PASS'
  }
  if (scenario === 'paused') {
    assert.ok(active.every(name => !name.startsWith('mcp__docs__')))
    return 'MCP E2E paused PASS'
  }
  if (scenario === 'new-agent') { expectNames([]); return 'MCP E2E isolation PASS' }
  if (scenario === 'golden') {
    if (step === 0) { step++; expectNames([]); return [tc('mcp_tool_search', { query: 'notion workspace info name', serverName: 'golden', limit: 8 })] }
    if (step === 1) {
      step++
      const result = input.messages.filter(m => m.role === 'tool').at(-1)
      assert.ok(result && JSON.stringify(result.content).includes('mcp__golden__fetch'))
      assert.ok(result && !JSON.stringify(result.content).includes('mcp__golden__utility-'))
      return [tc('mcp_tool_search', { query: 'the', serverName: 'golden', limit: 8 })]
    }
    if (step === 2) {
      step++
      assert.ok(input.messages.some(m => m.role === 'tool' && JSON.stringify(m.content).includes('NO_MATCH')))
      return [tc('mcp_tool_search', { query: '查询工作区名称', serverName: 'golden', limit: 8 })]
    }
    const result = input.messages.filter(m => m.role === 'tool').at(-1)
    assert.ok(result && JSON.stringify(result.content).includes('mcp__golden__fetch'))
    assert.ok(result && JSON.stringify(result.content).includes('mcp__golden__get-users'))
    return 'MCP E2E golden PASS'
  }
  return 'MCP E2E ordinary PASS'
}
async function handle(req, res) {
  const url = new URL(req.url, origin)
  const pathname = url.pathname
  if (pathname === '/favicon.ico') return res.writeHead(204).end()
  if (pathname === '/enterprise/auth/v1/authorize' || pathname === '/authorize') {
    const code = randomBytes(32).toString('base64url')
    codes.set(code, url.searchParams.get('code_challenge'))
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    const callback = new URL(url.searchParams.get('redirect_uri'))
    callback.searchParams.set('code', code); callback.searchParams.set('state', url.searchParams.get('state'))
    if (pathname === '/authorize') { callback.searchParams.set('iss', origin); oauthEvents.push('browser-authorize') }
    return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<a href="${callback.toString().replaceAll('&', '&amp;')}">确认登录</a>`)
  }
  if (pathname === '/enterprise/auth/v1/token') {
    const input = await body(req)
    if (input.grantType === 'authorization_code') {
      assert.equal(createHash('sha256').update(input.codeVerifier).digest('base64url'), codes.get(input.code))
      codes.delete(input.code); installationId = input.installationId
    } else assert.equal(input.refreshToken, refreshGrant)
    refreshGrant = `dshr_${randomBytes(32).toString('base64url')}`
    return json(res, { requestId, data: { accessToken: 'platform-access-e2e', tokenType: 'Bearer', expiresIn: 43200,
      refreshToken: refreshGrant, refreshExpiresIn: 2592000, clientId: 'dsh-desktop' } })
  }
  if (pathname.startsWith('/.well-known/oauth-protected-resource')) {
    oauthEvents.push('resource-discovery')
    return json(res, { resource: `${origin}/oauth`, authorization_servers: [origin] })
  }
  if (pathname === '/.well-known/oauth-authorization-server') {
    oauthEvents.push('issuer-discovery')
    return json(res, { issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], authorization_response_iss_parameter_supported: true })
  }
  if (pathname === '/token') {
    const input = new URLSearchParams(await bodyText(req))
    oauthEvents.push(input.get('grant_type'))
    if (input.get('grant_type') === 'authorization_code') {
      assert.equal(createHash('sha256').update(input.get('code_verifier')).digest('base64url'), codes.get(input.get('code')))
      codes.delete(input.get('code')); assert.equal(input.get('resource'), `${origin}/oauth`)
    } else {
      assert.equal(input.get('refresh_token'), mcpRefresh)
      if (rejectRefresh) return json(res, { error: 'invalid_grant' }, 400)
    }
    mcpAccess = `mcp-access-${++tokenIndex}`; mcpRefresh = `mcp-refresh-${tokenIndex}`
    return json(res, { access_token: mcpAccess, refresh_token: mcpRefresh, token_type: 'Bearer', expires_in: 3600 })
  }
  if (['/docs', '/resourceonly', '/oauth', '/apikey', '/golden'].includes(pathname)) {
    if (pathname === '/oauth' && (!mcpAccess || req.headers.authorization !== `Bearer ${mcpAccess}` || mcpAccess === rejectedAccess)) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/oauth"`)
      return json(res, { error: 'unauthorized' }, 401)
    }
    if (pathname === '/apikey') assert.equal(req.headers['x-api-key'], 'raw-key-for-e2e')
    if (req.method !== 'POST') return res.writeHead(405).end()
    const input = await body(req)
    methods.push({ server: pathname.slice(1), method: input.method, params: input.params, protocol: req.headers['mcp-protocol-version'] })
    if (input.id === undefined) return res.writeHead(202).end()
    // 旧协议服务器拒绝新版探测方法，官方 SDK 应自动回退 initialize。
    if (input.method === 'server/discover') return json(res, { jsonrpc: '2.0', id: input.id, error: { code: -32601, message: 'Method not found' } })
    let result
    if (input.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { ...(pathname === '/resourceonly' ? {} : { tools: {} }), resources: {} }, serverInfo: { name: pathname.slice(1), version: '1' } }
    else if (input.method === 'tools/list') {
      assert.notEqual(pathname, '/resourceonly', 'resource-only server must never receive tools/list')
      result = pathname === '/golden' ? { tools: goldenTools }
        : input.params?.cursor ? { tools: [tool('write')] } : { tools: [tool('echo')], nextCursor: 'page-2' }
    } else if (input.method === 'tools/call') result = { content: [{ type: 'text', text: `${input.params.name} result ${input.params.arguments.text}` }] }
    else if (input.method === 'resources/list') result = { resources: [{ uri: 'mcp://docs/readme', name: 'readme', mimeType: 'text/plain' }] }
    else if (input.method === 'resources/templates/list') result = { resourceTemplates: [{ uriTemplate: 'mcp://docs/{path}', name: 'document' }] }
    else if (input.method === 'resources/read') result = { contents: [{ uri: input.params.uri, mimeType: 'text/plain', text: 'resource body' }] }
    else throw new Error(`Unexpected MCP method ${input.method}`)
    return json(res, { jsonrpc: '2.0', id: input.id, result })
  }
  assert.equal(req.headers.authorization, 'Bearer platform-access-e2e')
  if (pathname.endsWith('/devices/enroll')) {
    const input = await body(req); assert.equal(input.harnessVersion, manifest.version)
    return json(res, { requestId, data: { id: '90018', userId: '10031', username: 'e2e', displayName: 'E2E', installationId,
      name: input.name, platform: input.platform, harnessVersion: input.harnessVersion, enterpriseBundleVersion: input.enterpriseBundleVersion,
      desiredRevision: 1, pluginInventoryDigest: null, pendingSessionEvents: 0, lastSuccessfulSyncAt: null,
      status: 'ACTIVE', lastSeenAt: '2026-09-22T00:00:00Z', revokedAt: null, revision: 1 } })
  }
  if (pathname.endsWith('/bootstrap')) return json(res, { requestId, data: { revision: 1,
    user: { id: '10031', username: 'e2e', displayName: 'E2E', departmentId: null }, device: { id: '90018', installationId, status: 'ACTIVE' },
    models: [{ alias: 'mcp-e2e', name: 'MCP E2E', apiProtocol: 'openai-completions', isDefault: true, contextWindow: 65536, maxTokens: 4096 }],
    quotas: [], plugins: { revision: 1, assignments: [] }, sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1048576 } } })
  if (pathname.endsWith('/mcp/assignments')) return json(res, { requestId, data: { revision: 1, validForMs: 60000, assignments: assignments() } })
  if (pathname.endsWith('/plugins/assignments')) return json(res, { requestId, data: { revision: 1, assignments: [] } })
  if (pathname.endsWith('/plugins/inventory')) { await body(req); return json(res, { requestId, data: { reported: 0 } }) }
  if (pathname.endsWith('/mcp/catalog')) { await body(req); return json(res, { requestId, data: {} }) }
  if (pathname.endsWith('/logout')) return json(res, { requestId, data: { loggedOut: true } })
  if (pathname.endsWith('/chat/completions')) {
    const output = modelResponse(await body(req))
    const calls = Array.isArray(output) ? output.map((fn, index) => ({ index, id: `call-${modelRequests.length}-${index}`, type: 'function', function: fn })) : undefined
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const choice of [
      { index: 0, delta: { role: 'assistant', ...(calls ? { tool_calls: calls } : { content: output }) }, finish_reason: null },
      { index: 0, delta: {}, finish_reason: calls ? 'tool_calls' : 'stop' },
    ]) res.write(`data: ${JSON.stringify({ id: `chat-${modelRequests.length}`, object: 'chat.completion.chunk', created: 1, model: 'mcp-e2e', choices: [choice] })}\n\n`)
    return res.end('data: [DONE]\n\n')
  }
  throw new Error(`Unexpected platform path ${pathname}`)
}
const server = createServer((req, res) => { void handle(req, res).catch(error => { errors.push(error.stack); json(res, { error: 'fixture failure' }, 500) }) })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
origin = `http://127.0.0.1:${server.address().port}`
  await writeFile(join(home, 'profiles/web/cordis.patch.yml'), `- id: owndsh\n  config:\n    baseUrl: '${origin}'\n- id: session-title-llm\n  disabled: true\n`)
const env = { ...process.env, DSH_HOME: home, OWNDSH_AUTH_URL_FILE: authorizeFile,
  SSH_TTY: 'web-mcp-e2e', DSH_PERMISSION_MODE: 'danger-full-access', PATH: `${join(home, 'opener')}:${dirname(process.execPath)}:${process.env.PATH}` }
let harness, browser, page, output = ''
async function boot() {
  harness = spawn(process.execPath, [dshEntry, '--profile', 'web', '--port', '0', '--no-open'], { cwd: join(home, 'workspace'), env, stdio: ['ignore', 'pipe', 'pipe'] })
  return await new Promise((resolve, reject) => {
    let startup = ''
    const timeout = setTimeout(() => reject(new Error('Web startup timeout')), 45000)
    const inspect = chunk => {
      startup += chunk; output += String(chunk).replace(/([?&]token=)[\w-]+/g, '$1[redacted]')
      const match = startup.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    }
    harness.stdout.on('data', inspect); harness.stderr.on('data', inspect)
    harness.once('exit', code => { clearTimeout(timeout); reject(new Error(`Harness exit ${code}`)) }); harness.once('error', reject)
  })
}
async function stop() { if (harness?.exitCode === null) { const done = once(harness, 'exit'); harness.kill('SIGINT'); await done } }
async function authorize(button) {
  await writeFile(authorizeFile, '')
  await button.click()
  let url
  for (let i = 0; i < 200; i++) { url = await readFile(authorizeFile, 'utf8').catch(() => ''); if (url) break; await delay(50) }
  assert.ok(url, 'Expected system browser handoff')
  const login = await browser.newPage()
  try { await login.goto(url); await login.getByRole('link', { name: '确认登录' }).click() } finally { await login.close() }
}
async function settings() {
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  await page.getByRole('button', { name: 'OwnDsh 设置', exact: true }).click()
  await page.getByRole('tab', { name: 'MCP', exact: true }).click()
}
async function prompt(text, expected) {
  const editor = page.locator('[contenteditable="true"], [contenteditable="plaintext-only"], textarea').first()
  await editor.fill(text); await editor.press('Enter')
  await page.getByText(expected, { exact: true }).waitFor({ timeout: 45000 })
}
try {
  const url = await boot()
  browser = await chromium.launch({ headless: true, ...(process.env.OWNDSH_CHROMIUM_PATH ? { executablePath: process.env.OWNDSH_CHROMIUM_PATH } : {}) })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(12000)
  await page.goto(url)
  const gate = page.getByRole('dialog', { name: 'OwnDsh', exact: true })
  await authorize(gate.getByRole('button', { name: '登录企业账号', exact: true }))
  await gate.waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('button', { name: '插件', exact: true }).count(), 0)
  checks.push('enterprise browser login; official plugin manager hidden')
  await settings()
  await page.getByRole('tab', { name: '插件', exact: true }).click()
  await page.getByRole('region', { name: '企业插件市场', exact: true }).getByText('暂无可用企业插件', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'MCP', exact: true }).click()
  checks.push('OwnDsh plugin market remains accessible')
  await page.getByRole('button', { name: '查看 docs 的 2 个工具' }).click()
  assert.match(await page.getByRole('region', { name: 'docs 工具简介', exact: true }).innerText(), /echo[\s\S]*write/)
  assert.match(await page.getByRole('region', { name: 'MCP resourceonly', exact: true }).innerText(), /已连接/)
  const oauth = page.getByRole('region', { name: 'MCP oauth', exact: true })
  await authorize(oauth.getByRole('button', { name: '连接 OAuth', exact: true }))
  await oauth.getByRole('button', { name: '禁用', exact: true }).waitFor()
  const api = page.getByRole('region', { name: 'MCP apikey', exact: true })
  await api.getByRole('textbox', { name: 'apikey API Key' }).fill('raw-key-for-e2e')
  await api.getByRole('button', { name: '连接', exact: true }).click()
  await api.getByRole('button', { name: '禁用', exact: true }).waitFor()
  checks.push('no-auth/API-key/OAuth connection; paginated discovery; resource-only server')
  await page.screenshot({ path: join(evidence, 'mcp-connected.png') })
  await page.getByRole('button', { name: /^(关闭|Close)$/ }).click()
  await prompt('E2E load', 'MCP E2E load PASS')
  checks.push('real AgentLoop: cold/search/accumulate/deduplicate/release/current-step call; API-key/OAuth calls; shared URI resources/templates/read')
  rejectedAccess = mcpAccess; scenario = 'refresh'; step = 0
  await prompt('E2E refresh', 'MCP E2E refresh PASS')
  assert.ok(oauthEvents.includes('refresh_token')); assert.notEqual(mcpAccess, rejectedAccess)
  checks.push('official SDK handles HTTP 401 and refresh-token rotation')
  rejectedAccess = mcpAccess; rejectRefresh = true; scenario = 'invalid-grant'; step = 0
  await prompt('E2E invalid grant', 'MCP E2E invalid-grant PASS')
  assert.equal(methods.filter(m => m.method === 'tools/call' && m.params.arguments.text === 'must-not-execute').length, 0)
  await settings()
  await oauth.getByText(/需要重新授权/).waitFor()
  await page.screenshot({ path: join(evidence, 'oauth-invalid-grant.png') })
  rejectRefresh = false
  await authorize(oauth.getByRole('button', { name: '重新授权', exact: true }))
  await oauth.getByRole('button', { name: '禁用', exact: true }).waitFor()
  await page.getByRole('button', { name: /^(关闭|Close)$/ }).click()
  scenario = 'recover'; step = 0
  await prompt('E2E recover the same conversation', 'MCP E2E recovery PASS')
  assert.ok(methods.some(m => m.method === 'tools/call' && m.params.arguments.text === 'reauthorized'))
  checks.push('invalid_grant blocks the rejected call, shows reauthorization, and recovers the same conversation')
  await settings()
  const docs = page.getByRole('region', { name: 'MCP docs', exact: true })
  await docs.getByRole('button', { name: '禁用', exact: true }).click()
  await docs.getByRole('button', { name: '启用', exact: true }).waitFor()
  await page.getByRole('button', { name: /^(关闭|Close)$/ }).click()
  scenario = 'paused'; step = 0
  await prompt('E2E paused', 'MCP E2E paused PASS')
  checks.push('pause removes tools from the existing conversation; ordinary chat remains usable')
  await settings(); await docs.getByRole('button', { name: '启用', exact: true }).click()
  await docs.getByRole('button', { name: '禁用', exact: true }).waitFor()
  await page.getByRole('button', { name: /^(关闭|Close)$/ }).click()
  await page.getByRole('button', { name: /^(New session|新建会话)$/ }).first().click()
  await page.getByText(/^(探索未至之境|Into the Unknown)$/).waitFor()
  scenario = 'new-agent'; step = 0
  await prompt('E2E new agent', 'MCP E2E isolation PASS')
  checks.push('reenable works; a new Agent does not inherit loaded tools')
  scenario = 'golden'; step = 0
  await prompt('E2E search golden', 'MCP E2E golden PASS')
  checks.push('real AgentLoop: Notion-shaped BM25 natural-language, stopword, Chinese, exact server filter, and next-step injection')
  await page.screenshot({ path: join(evidence, 'chat-tools.png') })
  await stop(); await page.goto(await boot()); await settings()
  await page.getByRole('region', { name: 'MCP oauth', exact: true }).getByRole('button', { name: '禁用', exact: true }).waitFor()
  assert.equal(oauthEvents.filter(e => e === 'browser-authorize').length, 2)
  checks.push('Host restart restores enterprise/OAuth credentials without another browser login')
  for (const name of ['docs', 'oauth', 'apikey']) assert.ok(methods.some(m => m.server === name && m.method === 'tools/list' && m.params?.cursor === 'page-2'))
  assert.equal(methods.filter(m => m.server === 'resourceonly' && m.method === 'tools/list').length, 0)
  assert.deepEqual(errors, [])
  assert.ok(!output.includes('does not implement saveDiscoveryState'), 'SDK callback binding must be supplied')
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ version: manifest.version, bundleHash, checks, oauthEvents, methods, modelRequests }, null, 2))
  console.log(JSON.stringify({ passed: checks, evidence, home }, null, 2))
} catch (error) {
  if (page) { await page.screenshot({ path: join(evidence, 'failure.png') }); await writeFile(join(evidence, 'failure.txt'), await page.locator('body').innerText()) }
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.stack, checks, errors, methods, modelRequests, oauthEvents, output, home }, null, 2))
  throw error
} finally { await browser?.close(); await stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
