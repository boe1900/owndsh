/**
 * [INPUT]: 依赖内置 Harness/插件运行树与 Playwright，使用临时 profile 并拦截账号动作 API
 * [OUTPUT]: 验证官方 Modal 在侧栏、Settings 和门禁内的确认、取消、焦点与窄屏布局
 * [POS]: desktop 的 WebView 兼容回归，不访问真实企业账号或卸载实际插件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(fileURLToPath(import.meta.url))
const runtime = process.env.OWNDSH_TEST_RUNTIME ?? join(root, '.build/pake/runtime')
const { chromium, webkit } = await import(process.env.OWNDSH_PLAYWRIGHT_MODULE ?? 'playwright')

test('packaged plugin uses Harness confirmation modals without native confirm', { timeout: 150000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh confirmation '))
  const child = spawn(join(runtime, 'bin/node'), [join(runtime, 'launcher.mjs')], {
    env: { HOME: process.env.HOME, DSH_HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let browser
  try {
    const launchUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Harness startup timeout')), 90000)
      timer.unref()
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`Harness exited ${code}`)))
      let output = ''
      child.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/OWNDSH_READY (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)
        if (match) { clearTimeout(timer); resolve(match[1]) }
      })
    })
    browser = await (process.env.OWNDSH_BROWSER === 'webkit' ? webkit : chromium).launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    const errors = []
    const calls = { logout: 0, uninstall: 0 }
    let state = 'READY'
    const status = () => ({ state, bundleVersion: '0.1.0', platformUrl: 'https://enterprise.example.com', transport: 'webServer.register' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.confirm = () => { throw new Error('Native confirm must not be called') }
      const Original = window.EventSource
      window.EventSource = class extends Original {
        constructor(url, options) {
          if (String(url).endsWith('/enterprise/api/v1/local/events')) return { addEventListener() {}, close() {} }
          super(url, options)
        }
      }
    })
    await page.route('**/enterprise/api/v1/local/**', async route => {
      const path = new URL(route.request().url()).pathname.split('/').at(-1)
      let data
      if (path === 'status') data = status()
      else if (path === 'bootstrap') data = {
        user: { id: '10031', username: 'test', displayName: 'Dialog Test', departmentId: null },
        device: { id: '90018', installationId: '4c96d076-a80a-4b6c-8df6-f0db804b6f0a', status: 'ACTIVE' },
      }
      else if (path === 'plugins') data = { assignmentRevision: 1, plugins: [] }
      else if (path === 'logout') { calls.logout++; state = 'SIGNED_OUT'; data = { loggedOut: true } }
      else if (path === 'uninstall') { calls.uninstall++; data = { uninstalled: true, restartRequested: false } }
      else throw new Error(`Unexpected enterprise API: ${path}`)
      await route.fulfill({ json: { data } })
    })
    await page.goto(launchUrl)
    const logout = page.getByRole('button', { name: '退出登录', exact: true })
    await logout.waitFor({ timeout: 45000 })
    const dialog = page.getByRole('dialog', { name: '退出 OwnDsh 账号', exact: true })
    await logout.click()
    await dialog.waitFor()
    assert.equal(calls.logout, 0)
    assert.equal(await dialog.getByRole('button', { name: '取消' }).evaluate(el => el === document.activeElement), true)
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Tab')
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)
    }
    await dialog.getByRole('button', { name: '取消' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await logout.evaluate(el => el === document.activeElement), true)
    await logout.click()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await logout.click()
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(calls.logout, 0)

    await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
    await page.getByText('OwnDsh 设置', { exact: true }).click()
    const account = page.getByRole('tabpanel', { name: '账号', exact: true })
    await account.getByRole('button', { name: '退出登录', exact: true }).click()
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await account.isVisible(), true, 'Escape must leave Settings open')
    await account.getByRole('button', { name: '退出登录', exact: true }).click()
    await mkdir(join(root, '.build'), { recursive: true })
    await page.screenshot({ path: join(root, '.build/confirm-desktop.png') })
    await dialog.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.getByRole('dialog', { name: 'OwnDsh', exact: true }).getByRole('button', { name: '登录企业账号', exact: true }).waitFor()
    await account.waitFor({ state: 'hidden' })
    assert.equal(calls.logout, 1)

    await page.setViewportSize({ width: 375, height: 720 })
    const uninstall = page.getByRole('dialog', { name: 'OwnDsh', exact: true }).getByRole('button', { name: '卸载 OwnDsh', exact: true })
    const removal = page.getByRole('dialog', { name: '卸载 OwnDsh', exact: true })
    await uninstall.click()
    await removal.waitFor()
    await page.screenshot({ path: join(root, '.build/confirm-mobile.png') })
    const bounds = await removal.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375)
    await page.keyboard.press('Shift+Tab')
    assert.equal(await removal.evaluate(el => el.contains(document.activeElement)), true)
    await page.keyboard.press('Escape')
    await removal.waitFor({ state: 'hidden' })
    await uninstall.click()
    await removal.getByRole('button', { name: '取消' }).click()
    await removal.waitFor({ state: 'hidden' })
    assert.equal(calls.uninstall, 0)
    await uninstall.click()
    await removal.getByRole('button', { name: '确认卸载' }).click()
    await page.getByText('OwnDsh 已卸载，请手动重启 Harness。', { exact: true }).last().waitFor()
    assert.equal(calls.uninstall, 1)
    assert.deepEqual(errors, [])
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0]
    if (page) {
      await page.screenshot({ path: join(root, '.build/confirm-failure.png') })
      error.message += `\n${await page.locator('body').innerText()}`
    }
    throw error
  } finally {
    await browser?.close()
    const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve()
    child.stdin.end()
    await exited
    await rm(home, { recursive: true, force: true })
  }
})
