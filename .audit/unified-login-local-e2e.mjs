/**
 * [INPUT]: 依赖真实本地 Server/Console、隔离 rc.5 Harness profile、新打包插件和 Chromium；测试密码仅从环境读取。
 * [OUTPUT]: 验证新鲜登录无需二次确认、已有会话需确认、验证码/首次改密、employee、拒绝与退出隔离，输出无密证据及截图。
 * [POS]: .audit 的统一登录跨端联调器；不模拟认证 API，不触碰日常 profile，系统 URL opener 只交接给测试浏览器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const origin = process.env.OWNDSH_E2E_ORIGIN ?? 'http://127.0.0.1:62227'
const work = resolve('.tmp/unified-login-local')
const home = join(work, `run-${Date.now()}`, 'profile')
const runtime = join(work, 'runtime')
const output = join(work, 'evidence')
const initialAdminPassword = process.env.OWNDSH_ADMIN_PASSWORD
const password = process.env.OWNDSH_LOGIN_PASSWORD
assert.ok(initialAdminPassword && password, 'Set OWNDSH_ADMIN_PASSWORD and OWNDSH_LOGIN_PASSWORD')
const { chromium } = await import(pathToFileURL(process.env.OWNDSH_PLAYWRIGHT_MODULE
  ?? '/Users/cola/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'))
// 每轮复制未启动的安装模板，避免复用已绑定到上轮员工的 installation。
await cp(join(work, 'profile'), home, { recursive: true, verbatimSymlinks: true })
const installed = join(home, 'profiles/web/node_modules/owndsh-plugin')
const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(await readFile(join(installed, 'lib/index.js'))),
  hash(await readFile('plugin/packages/bundle/lib/index.js')), 'Installed tarball must match the new built plugin')
await mkdir(output, { recursive: true })
await mkdir(join(home, 'workspace'), { recursive: true })
await mkdir(join(work, 'opener'), { recursive: true })
await writeFile(join(home, 'settings.yaml'), `owndsh:\n  baseUrl: ${origin}\n`)
await writeFile(join(home, 'profiles/web/cordis.patch.yml'), '- id: session-title-llm\n  disabled: true\n')
const authFile = join(work, 'authorize-url')
for (const name of ['open', 'xdg-open']) await writeFile(join(work, 'opener', name),
  '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.OWNDSH_AUTH_URL_FILE, process.argv.at(-1))\n', { mode: 0o700 })
const checks = []
const requests = []
let child, browser, stage = 'admin-initial-login', hostOutput = ''
let captchaCount = 0, passwordChanges = 0, credentialsRequests = 0
const record = (name, data = {}) => { checks.push({ name, ...data }); console.log(`PASS ${name}`) }
const redact = text => text.replace(/([?&](?:token|code|state|transaction_id)=)[^\s&"<>]+/g, '$1[redacted]')
async function save(extra = {}) {
  const evidence = { date: '2026-11-10', origin, pluginVersion: manifest.version, harnessVersion: '0.2.1-rc.5',
    pluginSha256: hash(await readFile(join(installed, 'lib/index.js'))), checks, requests,
    captchaCount, passwordChanges, ...extra }
  await writeFile(join(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n')
}
async function signIn(page, username, currentPassword) {
  const captchaPromise = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/code')
  await page.getByLabel('用户名', { exact: true }).waitFor()
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(currentPassword)
  const captcha = (await (await captchaPromise).json()).data
  if (captcha.captchaEnabled) {
    const raw = execFileSync('docker', ['exec', 'owndsh-login-local-redis-1', 'sh', '-ec',
      'export REDISCLI_AUTH="$REDIS_PASSWORD"; exec redis-cli --raw GET "$1"', 'redis-cli', `global:captcha_codes:${captcha.uuid}`], { encoding: 'utf8' }).trim()
    await page.getByLabel('验证码', { exact: true }).fill(String(JSON.parse(raw)))
    captchaCount++
  }
  const response = page.waitForResponse(response => response.url() === `${origin}/enterprise/auth/v1/password`)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const status = (await response).status()
  if (status === 409) {
    await page.getByLabel('新密码', { exact: true }).fill(password)
    await page.getByLabel('确认新密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '设置密码并登录', exact: true }).click()
    passwordChanges++
  } else assert.equal(status, 200, `Password login failed (${status})`)
}
try {
  browser = await chromium.launch({ headless: true })
  const adminContext = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  const admin = await adminContext.newPage()
  // 先挂载监听，再跳转，确保捕获真实验证码请求。
  const adminLogin = signIn(admin, 'admin', initialAdminPassword)
  await admin.goto(`${origin}/login`)
  await adminLogin
  await admin.waitForURL(url => url.pathname === '/')
  const adminIdentity = await adminContext.request.get(`${origin}/enterprise/auth/v1/session`)
  assert.equal(adminIdentity.status(), 200)
  record('real-admin-login', { initialPasswordChanged: passwordChanges > 0 })
  const username = `login${Date.now().toString(36)}`
  const create = await adminContext.request.post(`${origin}/enterprise/admin/v1/members`, {
    headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
    data: { username, displayName: '联调员工', initialPassword: `${password}A` }
  })
  assert.equal(create.status(), 201, `Create employee failed (${create.status()})`)
  const created = (await create.json()).data
  assert.deepEqual(created.member.roles, ['employee'])
  await adminContext.close()
  record('create-employee-through-real-admin-api')

  stage = 'host-start'
  child = spawn(process.execPath, [join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--port', '0', '--no-open'], {
    cwd: join(home, 'workspace'), env: { ...process.env, DSH_HOME: home, SSH_TTY: 'unified-login-e2e',
      PATH: `${join(work, 'opener')}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, OWNDSH_AUTH_URL_FILE: authFile },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const launchUrl = await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`Harness startup timeout: ${redact(hostOutput.slice(-5000))}`)), 90000)
    child.once('error', reject)
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Harness exited ${code}: ${redact(hostOutput.slice(-5000))}`)) })
    const inspect = chunk => {
      hostOutput += chunk
      const url = hostOutput.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)?.[1]
      if (url) { clearTimeout(timer); resolvePromise(url) }
    }
    child.stdout.on('data', inspect); child.stderr.on('data', inspect)
  })
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  context.on('response', response => {
    const url = new URL(response.url())
    if (url.origin === origin && url.pathname.startsWith('/enterprise/')) {
      requests.push({ method: response.request().method(), path: url.pathname, status: response.status() })
      if (url.pathname === '/enterprise/auth/v1/password') credentialsRequests++
    }
  })
  const host = await context.newPage()
  await host.goto(launchUrl)
  const continuation = host.getByText(/^(继续|Continue)$/, { exact: true }).first()
  await continuation.waitFor({ state: 'visible', timeout: 3000 }).then(() => continuation.click()).catch(() => {})
  const gate = host.getByRole('dialog', { name: 'OwnDsh', exact: true })
  const status = () => host.evaluate(async () => (await (await fetch('/enterprise/api/v1/local/status')).json()).data)
  async function waitState(expected) {
    for (let i = 0; i < 150; i++) { const current = await status(); if (current.state === expected) return current; await delay(100) }
    throw new Error(`Expected Host state ${expected}; got ${JSON.stringify(await status())}`)
  }
  async function begin() {
    await rm(authFile, { force: true })
    await gate.getByRole('button', { name: '登录企业账号', exact: true }).click()
    for (let i = 0; i < 100; i++) {
      const url = await readFile(authFile, 'utf8').catch(() => '')
      if (url) { await rm(authFile, { force: true }); return url }
      await delay(50)
    }
    throw new Error('Host did not open the system-browser authorization URL')
  }
  async function logout() {
    const result = await host.evaluate(async () => {
      const response = await fetch('/enterprise/api/v1/local/logout', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
      }); return { status: response.status, data: await response.json() }
    })
    assert.equal(result.status, 200); await gate.waitFor({ state: 'visible' })
  }
  async function completed(page) {
    await page.getByRole('heading', { name: '网页授权已完成' }).waitFor()
    assert.equal(page.url(), `${origin}/authorized`)
    assert.equal(await page.getByRole('link', { name: '打开 OwnDsh' }).getAttribute('href'), 'owndsh://open')
    await waitState('READY')
    await gate.waitFor({ state: 'hidden' })
  }
  async function approve(page) {
    await page.getByRole('button', { name: /^以 .+ 继续$/ }).click()
    await completed(page)
  }

  stage = 'first-desktop-login'
  const first = await context.newPage()
  const firstLogin = signIn(first, username, `${password}A`)
  await first.goto(await begin()); await firstLogin
  await completed(first)
  await first.screenshot({ path: join(output, 'authorized.png'), fullPage: true })
  await host.screenshot({ path: join(output, 'host-ready.png'), fullPage: true })
  record('employee-first-login-captcha-password-change-pkce-enroll-bootstrap-ready')
  assert.equal((await context.request.get(`${origin}/enterprise/admin/v1/members`)).status(), 403)
  record('employee-cannot-access-admin-api')

  stage = 'client-logout-browser-reuse'
  await logout()
  assert.equal((await context.request.get(`${origin}/enterprise/auth/v1/session`)).status(), 200)
  const passwordBefore = credentialsRequests
  const second = await context.newPage(); await second.goto(await begin())
  await second.getByText('联调员工', { exact: true }).waitFor()
  assert.equal(await second.getByLabel('密码', { exact: true }).count(), 0)
  await second.screenshot({ path: join(output, 'authorize.png'), fullPage: true })
  await approve(second)
  assert.equal(credentialsRequests, passwordBefore)
  record('client-logout-preserves-browser-session-and-next-login-skips-credentials')

  stage = 'browser-logout-preserves-client'
  const webLogout = await context.request.post(`${origin}/enterprise/auth/v1/logout`, { headers: { Origin: origin } })
  assert.equal(webLogout.status(), 200)
  assert.equal((await context.request.get(`${origin}/enterprise/auth/v1/session`)).status(), 401)
  assert.equal((await status()).state, 'READY')
  const boot = await host.evaluate(async () => { const r = await fetch('/enterprise/api/v1/local/refresh', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  }); return r.status })
  assert.equal(boot, 200)
  record('browser-logout-revokes-cookie-and-client-remains-ready-after-server-refresh')

  stage = 'decline-and-retry'
  await logout()
  const fresh = await context.newPage()
  const freshLogin = signIn(fresh, username, password)
  await fresh.goto(await begin()); await freshLogin
  await completed(fresh)
  record('fresh-login-after-browser-logout-needs-no-second-confirmation')
  await logout()
  const denied = await context.newPage(); await denied.goto(await begin())
  await denied.getByText('联调员工', { exact: true }).waitFor()
  await denied.getByRole('button', { name: '取消登录', exact: true }).click()
  const cancelled = await waitState('CANCELLED')
  assert.equal(cancelled.errorCode, 'ENT_AUTH_CANCELLED')
  record('browser-denial-maps-to-client-cancelled')
  const retry = await context.newPage(); await retry.goto(await begin()); await approve(retry)
  record('login-after-cancellation-reuses-browser-session')
  await retry.setViewportSize({ width: 390, height: 844 })
  await retry.screenshot({ path: join(output, 'authorized-mobile.png'), fullPage: true })
  await logout()
  await save({ result: 'passed', nativeScheme: 'fixed link verified; OS activation not exercised',
    firstPartyLocalProvider: 'real', oidcLdap: 'not exercised' })
  console.log(`Evidence: ${output}/result.json`)
} catch (error) {
  await save({ result: 'failed', stage, error: redact(error.message) })
  throw error
} finally {
  await browser?.close()
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGINT')
    if (!await Promise.race([exited.then(() => true), delay(8000).then(() => false)])) { child.kill('SIGKILL'); await exited }
  }
  await rm(authFile, { force: true })
}
