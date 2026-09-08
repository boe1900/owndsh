/**
 * [INPUT]: 真实内置 Harness、OwnDsh 插件、Chromium 与临时 HTTP 授权/模型服务
 * [OUTPUT]: 从登录、真实聊天请求到凭证失效门禁及重新登录恢复的 E2E，验证闲置零请求和网络故障保留会话
 * [POS]: 插件的桌面认证闭环验收，外部 runtime 显式传入；凭证/服务/profile 全部隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = dirname(fileURLToPath(import.meta.url))
const runtime = process.env.OWNDSH_TEST_RUNTIME
assert.ok(runtime, 'Set OWNDSH_TEST_RUNTIME to a prepared OwnDsh Desktop runtime containing the plugin under test')
const { chromium } = await import(process.env.OWNDSH_PLAYWRIGHT_MODULE ?? 'playwright')
const requestId = `req_${'0'.repeat(26)}`
const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify('error' in value ? value : { ...value, requestId }))
}
const readBody = async request => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString())
}

test('authentication closes the loop through real chat requests without resident SSE', { timeout: 180000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh auth E2E '))
  const opener = join(home, 'opener')
  const authorizeFile = join(home, 'authorize-url')
  await mkdir(opener)
  // 生产协议固定十二小时 Access Token；只推进隔离 Host 的时钟，保持真实契约与认证代码。
  const clockFile = join(home, 'clock')
  const preload = join(home, 'clock.mjs')
  let clockOffset = 0
  await writeFile(clockFile, '0')
  await writeFile(preload, `import { readFileSync } from 'node:fs';
const NativeDate = Date;
const now = () => NativeDate.now() + Number(readFileSync(process.env.OWNDSH_TEST_CLOCK, 'utf8'));
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [now()])); }
  static now() { return now(); }
};
`)
  // 只把系统打开 URL 的动作交给测试浏览器；PKCE 和所有认证请求仍走发行代码。
  const openScript = '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.OWNDSH_AUTH_URL_FILE, process.argv.at(-1))\n'
  for (const name of ['open', 'xdg-open']) await writeFile(join(opener, name), openScript, { mode: 0o700 })

  let mode = 'ok'
  let installationId
  let grant
  let tokenNumber = 0
  let gatewayCalls = 0
  let refreshCalls = 0
  let totalCalls = 0
  const codes = new Map()
  const serverErrors = []
  const backend = createServer((request, response) => {
    void handle(request, response).catch(error => { serverErrors.push(error.message); response.writeHead(500).end() })
  })
  async function handle(request, response) {
    totalCalls++
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname === '/enterprise/auth/v1/authorize') {
      const code = randomBytes(32).toString('base64url')
      codes.set(code, url.searchParams.get('code_challenge'))
      const callback = new URL(url.searchParams.get('redirect_uri'))
      callback.searchParams.set('state', url.searchParams.get('state'))
      callback.searchParams.set('code', code)
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<meta charset="utf-8"><h1>测试企业登录</h1><a href="${callback.toString().replaceAll('&', '&amp;')}">确认登录</a>`)
      return
    }
    if (url.pathname === '/enterprise/auth/v1/token') {
      const input = await readBody(request)
      if (input.grantType === 'authorization_code') {
        assert.equal(createHash('sha256').update(input.codeVerifier).digest('base64url'), codes.get(input.code))
        assert.equal(codes.delete(input.code), true)
        installationId = input.installationId
      } else {
        refreshCalls++
        assert.equal(input.refreshToken, grant)
        if (mode !== 'ok') {
          const code = mode === 'offline' ? 'ENT_PLATFORM_UNAVAILABLE' : mode === 'revoked' ? 'ENT_DEVICE_REVOKED' : 'ENT_AUTH_SESSION_EXPIRED'
          json(response, mode === 'offline' ? 503 : mode === 'revoked' ? 403 : 401, {
            error: { code, message: 'test rejection', retryable: mode === 'offline', requestId },
          })
          return
        }
      }
      tokenNumber++
      grant = `dshr_${randomBytes(32).toString('base64url')}`
      json(response, 200, { data: {
        accessToken: `e2e-platform-access-${tokenNumber}`, tokenType: 'Bearer', expiresIn: 43200,
        refreshToken: grant, refreshExpiresIn: 2592000, clientId: 'dsh-desktop',
      } })
      return
    }
    assert.equal(request.headers.authorization, `Bearer e2e-platform-access-${tokenNumber}`)
    if (url.pathname.endsWith('/devices/enroll')) {
      const input = await readBody(request)
      json(response, 200, { data: {
        id: '90018', userId: '10031', username: 'auth-test', displayName: 'Auth Test', installationId,
        name: input.name, platform: input.platform, harnessVersion: input.harnessVersion,
        enterpriseBundleVersion: input.enterpriseBundleVersion, desiredRevision: 1,
        pluginInventoryDigest: null, pendingSessionEvents: 0, lastSuccessfulSyncAt: null,
        status: 'ACTIVE', lastSeenAt: '2026-09-08T00:00:00Z', revokedAt: null, revision: 1,
      } })
    } else if (url.pathname.endsWith('/bootstrap')) {
      json(response, 200, { data: {
        revision: 1, user: { id: '10031', username: 'auth-test', displayName: 'Auth Test', departmentId: null },
        device: { id: '90018', installationId, status: 'ACTIVE' },
        models: [{ alias: 'auth-e2e', name: 'Auth E2E', apiProtocol: 'openai-completions', isDefault: true, contextWindow: 65536, maxTokens: 1024 }],
        quotas: [], plugins: { revision: 1, assignments: [] },
        sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1048576 },
      } })
    } else if (url.pathname.endsWith('/plugins/inventory')) {
      json(response, 200, { data: { reported: (await readBody(request)).items.length } })
    } else if (url.pathname.endsWith('/chat/completions')) {
      await readBody(request)
      gatewayCalls++
      const content = `Auth E2E reply ${gatewayCalls}`
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const choice of [
        { index: 0, delta: { role: 'assistant', content }, finish_reason: null },
        { index: 0, delta: {}, finish_reason: 'stop' },
      ]) response.write(`data: ${JSON.stringify({ id: 'chatcmpl-e2e', object: 'chat.completion.chunk', created: 1, model: 'auth-e2e', choices: [choice] })}\n\n`)
      response.end('data: [DONE]\n\n')
    } else if (url.pathname.endsWith('/logout')) {
      json(response, 200, { data: { loggedOut: true } })
    } else {
      throw new Error(`Unexpected test backend route: ${url.pathname}`)
    }
  }
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  const platformUrl = `http://127.0.0.1:${backend.address().port}`
  await writeFile(join(home, 'settings.yaml'), `owndsh:\n  serverUrl: ${platformUrl}\n`)
  await mkdir(join(home, 'profiles/web'), { recursive: true })
  await writeFile(join(home, 'profiles/web/cordis.patch.yml'), '- id: session-title-llm\n  disabled: true\n')
  const child = spawn(join(runtime, 'bin/node'), [join(runtime, 'launcher.mjs')], {
    env: { HOME: home, DSH_HOME: home, PATH: `${opener}:/usr/bin:/bin:/usr/sbin:/sbin`, OWNDSH_AUTH_URL_FILE: authorizeFile,
      // 无人值守 Host 使用官方 browse 文件夹选择器，避免打开 macOS 原生弹窗。
      SSH_TTY: 'auth-e2e', OWNDSH_TEST_CLOCK: clockFile, NODE_OPTIONS: `--import=${pathToFileURL(preload)}` },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let browser
  try {
    const launchUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Harness startup timeout')), 90000)
      let output = ''
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`Harness exited ${code}`)))
      child.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/OWNDSH_READY (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)
        if (match) { clearTimeout(timer); resolve(match[1]) }
      })
    })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    const requests = []
    page.on('request', request => { if (request.url().includes('/enterprise/api/v1/local/')) requests.push(new URL(request.url()).pathname) })
    const gate = page.getByRole('dialog', { name: 'OwnDsh', exact: true })
    await page.goto(launchUrl)
    async function signIn() {
      await rm(authorizeFile, { force: true })
      await gate.getByRole('button', { name: '登录企业账号', exact: true }).click()
      let url
      for (let attempt = 0; attempt < 100; attempt++) {
        url = await readFile(authorizeFile, 'utf8').catch(() => '')
        if (url) break
        await delay(50)
      }
      assert.ok(url, 'Host must open the PKCE authorization URL')
      const loginPage = await browser.newPage()
      await loginPage.goto(url)
      await loginPage.getByRole('link', { name: '确认登录' }).click()
      await gate.waitFor({ state: 'hidden', timeout: 15000 })
      await loginPage.close()
    }
    async function prompt(text) {
      const editor = page.locator('[contenteditable="true"], [contenteditable="plaintext-only"], textarea').first()
      await editor.fill(text)
      await editor.press('Enter')
    }
    async function idle() {
      // 超过 Access Token 有效期，确认没有提前续期、后台配置请求或常驻 SSE。
      await delay(500)
      const before = totalCalls
      const localBefore = requests.length
      clockOffset += 13 * 60 * 60 * 1000
      await writeFile(clockFile, String(clockOffset))
      await delay(3000)
      assert.equal(totalCalls, before, 'Idle client must not contact the enterprise backend')
      assert.equal(requests.length, localBefore, 'Idle page must not poll local state')
      assert.ok(requests.every(path => !path.endsWith('/events')))
    }
    await signIn()
    await page.getByRole('button', { name: 'Choose workspace', exact: true }).click()
    await page.getByRole('button', { name: 'Edit path', exact: true }).click()
    await page.getByRole('textbox', { name: 'Edit path', exact: true }).fill(join(home, 'workspace'))
    await page.getByRole('textbox', { name: 'Edit path', exact: true }).press('Enter')
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await idle()
    const before = refreshCalls
    await prompt('Say hello for the successful refresh check')
    await page.getByText('Auth E2E reply 1', { exact: true }).waitFor({ timeout: 20000 })
    assert.equal(refreshCalls, before + 1)

    await idle()
    mode = 'offline'
    const retainedGrant = grant
    await prompt('Network failure must preserve my session')
    await page.getByText(/enterprise platform is unavailable|enterprise platform request failed|ENT_PLATFORM_UNAVAILABLE|503/)
      .filter({ visible: true }).first().waitFor({ timeout: 60000 })
    assert.equal(await gate.isVisible(), false)
    assert.equal(grant, retainedGrant)
    mode = 'ok'
    await prompt('Retry after network recovery')
    await page.getByText('Auth E2E reply 2', { exact: true }).waitFor({ timeout: 20000 })

    await idle()
    mode = 'expired'
    await prompt('Expired refresh credential must open the login page')
    await gate.getByText('登录已过期', { exact: true }).waitFor({ timeout: 15000 })
    assert.equal(gatewayCalls, 2, 'Rejected refresh must not reach the model backend')
    await mkdir(join(root, '.build'), { recursive: true })
    await page.screenshot({ path: join(root, '.build/auth-expired.png') })
    mode = 'ok'
    await signIn()
    await prompt('Resume after logging in again')
    await page.getByText('Auth E2E reply 3', { exact: true }).waitFor({ timeout: 20000 })

    await idle()
    mode = 'revoked'
    await prompt('Revoked device must open the login gate')
    await gate.getByText('设备已撤销', { exact: true }).waitFor({ timeout: 15000 })
    assert.equal(gatewayCalls, 3)
    assert.deepEqual(serverErrors, [])
    await writeFile(join(root, '.build/auth-e2e-result.json'), JSON.stringify({
      idleNoRequests: true, noResidentSse: true, requestTimeRefresh: true,
      networkFailurePreservesSession: true, expiredRefreshShowsLogin: true,
      reloginResumesChat: true, revokedDeviceShowsLogin: true,
    }, null, 2))
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0]
    if (page) {
      await mkdir(join(root, '.build'), { recursive: true })
      await page.screenshot({ path: join(root, '.build/auth-failure.png') })
      await writeFile(join(root, '.build/auth-failure.txt'), `${await page.locator('body').innerText()}\nBackend errors: ${JSON.stringify(serverErrors)}\n${await readFile(join(home, 'desktop.log'), 'utf8')}`)
    }
    throw error
  } finally {
    await browser?.close()
    const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve()
    child.stdin.end()
    await exited
    backend.closeAllConnections()
    await new Promise(resolve => backend.close(resolve))
    await rm(home, { recursive: true, force: true })
  }
})
