/**
 * [INPUT]: 依赖内置 Harness/插件运行树与 Playwright，使用临时 profile 并拦截账号动作 API
 * [OUTPUT]: 验证只读账号地址、退出后编辑及失败保留、授权中禁止修改，并覆盖市场/确认框和桌面/窄屏布局
 * [POS]: 插件的 WebView 兼容回归，外部 runtime 显式传入，不访问真实企业账号或卸载实际插件
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
const runtime = process.env.OWNDSH_TEST_RUNTIME
assert.ok(runtime, 'Set OWNDSH_TEST_RUNTIME to a prepared OwnDsh Desktop runtime containing the plugin under test')
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
    // 奇数高度使居中设置面板落在半像素上，覆盖宿主超椭圆边框的绘制场景。
    const page = await browser.newPage({ viewport: { width: 1400, height: 901 } })
    const errors = []
    const calls = { logout: 0, uninstall: 0, installPlugin: 0, removePlugin: 0, refresh: 0 }
    const pluginStatus = {
      assignmentRevision: 1,
      catalog: [
        { packageName: '@enterprise/code-review', pluginVersionId: '881', version: '1.2.0', sizeBytes: 24000, operatingSystems: ['darwin', 'linux', 'win32'] },
        { packageName: '@enterprise/knowledge-base', pluginVersionId: '882', version: '2.0.0', sizeBytes: 1200000, operatingSystems: ['darwin', 'linux'] },
        { packageName: '@enterprise/report-export', pluginVersionId: '883', version: '1.0.0', sizeBytes: 84000, operatingSystems: ['win32'], installErrorCode: 'ENT_PLUGIN_INCOMPATIBLE' },
      ],
      plugins: [{ packageName: '@enterprise/knowledge-base', version: '1.0.0', sha256: 'a'.repeat(64), desiredRevision: 1, desiredState: 'INSTALLED', state: 'ACTIVE', lastErrorCode: null, restartMarker: null }],
    }
    let state = 'READY'
    let platformUrl = 'https://enterprise.example.com'
    const status = () => ({ state, bundleVersion: '0.1.0', platformUrl, transport: 'webServer.register' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.confirm = () => { throw new Error('Native confirm must not be called') }
      const Original = window.EventSource
      window.EventSource = class extends Original {
        constructor(url, options) {
          if (String(url).endsWith('/enterprise/api/v1/local/events')) throw new Error('OwnDsh must not open a resident SSE connection')
          super(url, options)
        }
      }
    })
    await page.route('**/enterprise/api/v1/local/**', async route => {
      const path = new URL(route.request().url()).pathname.split('/').at(-1)
      let data
      if (path === 'status') data = status()
      else if (path === 'refresh') { calls.refresh++; data = status() }
      else if (path === 'bootstrap') data = {
        user: { id: '10031', username: 'test', displayName: 'Dialog Test', departmentId: null },
        device: { id: '90018', installationId: '4c96d076-a80a-4b6c-8df6-f0db804b6f0a', status: 'ACTIVE' },
      }
      else if (path === 'plugins') data = pluginStatus
      else if (path === 'install') {
        assert.deepEqual(route.request().postDataJSON(), { packageName: '@enterprise/code-review', pluginVersionId: '881' })
        calls.installPlugin++
        pluginStatus.plugins.push({ packageName: '@enterprise/code-review', version: '1.2.0', sha256: 'b'.repeat(64), desiredRevision: 1, desiredState: 'INSTALLED', state: 'RESTART_REQUIRED', lastErrorCode: null, restartMarker: 'test-run' })
        data = pluginStatus
      }
      else if (path === 'remove') {
        assert.deepEqual(route.request().postDataJSON(), { packageName: '@enterprise/code-review' })
        calls.removePlugin++
        pluginStatus.plugins.find(plugin => plugin.packageName === '@enterprise/code-review').desiredState = 'ABSENT'
        pluginStatus.plugins.find(plugin => plugin.packageName === '@enterprise/code-review').state = 'RESTART_REQUIRED'
        data = pluginStatus
      }
      else if (path === 'logout') { calls.logout++; state = 'SIGNED_OUT'; data = { loggedOut: true } }
      else if (path === 'server') {
        const { serverUrl } = route.request().postDataJSON()
        if (new URL(serverUrl).pathname !== '/') {
          await route.fulfill({ status: 400, json: { error: { code: 'ENT_INVALID_REQUEST' } } })
          return
        }
        platformUrl = serverUrl
        data = { serverUrl }
      }
      else if (path === 'start') { state = 'AUTHORIZING'; data = { flowId: 'flow-1' } }
      else if (path === 'cancel') { state = 'CANCELLED'; data = { cancelled: true } }
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

    assert.equal(await page.getByRole('button', { name: '企业插件', exact: true }).count(), 0)
    await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
    await page.getByText('OwnDsh 设置', { exact: true }).click()
    const account = page.getByRole('tabpanel', { name: '账号', exact: true })
    const device = account.getByText('90018 · 4c96d076-a80a-4b6c-8df6-f0db804b6f0a', { exact: true })
    await device.waitFor()
    assert.equal(await account.getByText('连接时间', { exact: true }).count(), 0)
    const refreshBefore = calls.refresh
    await account.getByRole('button', { name: '刷新配置', exact: true }).click()
    assert.equal(calls.refresh, refreshBefore + 1)
    assert.equal(await account.getByRole('button', { name: '修改 Server 地址', exact: true }).count(), 0)
    assert.equal(await account.getByRole('textbox', { name: 'OwnDsh Server 地址', exact: true }).count(), 0)
    await mkdir(join(root, '.build'), { recursive: true })
    await page.mouse.move(0, 0)
    await page.screenshot({ path: join(root, '.build/account-desktop.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(root, '.build/account-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 375, height: 812 })
    await account.getByRole('button', { name: '刷新配置', exact: true }).click({ trial: true })
    assert.equal(await account.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    assert.ok((await device.boundingBox()).height <= 22, 'Device identity must stay on one line')
    assert.equal(await device.getAttribute('title'), '90018 · 4c96d076-a80a-4b6c-8df6-f0db804b6f0a')
    for (const button of await account.getByRole('button').all()) await button.click({ trial: true })
    await page.mouse.move(0, 0)
    await page.screenshot({ path: join(root, '.build/account-mobile.png') })
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.getByRole('tab', { name: '插件', exact: true }).click()
    const market = page.getByRole('region', { name: '企业插件市场', exact: true })
    await market.getByText('@enterprise/code-review', { exact: true }).waitFor()
    assert.equal(calls.installPlugin, 0)
    await mkdir(join(root, '.build'), { recursive: true })
    await page.screenshot({ path: join(root, '.build/plugin-market-desktop.png') })
    await market.getByRole('button', { name: '已安装 (1)', exact: true }).click()
    assert.equal(await market.locator('article').count(), 1)
    await market.getByRole('button', { name: '全部插件', exact: true }).click()
    await market.getByRole('searchbox', { name: '搜索企业插件' }).fill('code-review')
    assert.equal(await market.locator('article').count(), 1)
    await market.getByText('@enterprise/code-review', { exact: true }).click()
    const detail = page.getByRole('dialog', { name: '插件详情', exact: true })
    await detail.waitFor()
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Tab')
      assert.equal(await detail.evaluate(element => element.contains(document.activeElement)), true)
    }
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'hidden' })
    assert.equal(await market.isVisible(), true, 'Escape must leave the Settings Plugins tab open')
    await market.getByRole('button', { name: '安装', exact: true }).click()
    await market.getByText('等待重启', { exact: true }).waitFor()
    assert.equal(calls.installPlugin, 1)
    pluginStatus.plugins.find(plugin => plugin.packageName === '@enterprise/code-review').state = 'ACTIVE'
    await market.getByRole('button', { name: '刷新插件', exact: true }).click()
    const removePlugin = market.getByRole('button', { name: '卸载 @enterprise/code-review', exact: true })
    await removePlugin.waitFor()
    await removePlugin.click()
    const pluginConfirmation = page.getByRole('dialog', { name: '卸载企业插件', exact: true })
    await pluginConfirmation.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(calls.removePlugin, 0)
    await removePlugin.click()
    await pluginConfirmation.getByRole('button', { name: '确认卸载', exact: true }).click()
    await market.getByText('等待重启', { exact: true }).waitFor()
    assert.equal(calls.removePlugin, 1)
    await market.getByRole('button', { name: '刷新插件', exact: true }).click()
    assert.equal(calls.installPlugin, 1)
    await market.getByRole('searchbox', { name: '搜索企业插件' }).fill('')
    await page.setViewportSize({ width: 375, height: 812 })
    await market.getByRole('searchbox', { name: '搜索企业插件' }).scrollIntoViewIfNeeded()
    // 等待宿主侧栏收起动画结束，并确认右侧控件未被裁切或遮挡。
    await market.getByRole('button', { name: '刷新插件', exact: true }).click({ trial: true })
    await page.screenshot({ path: join(root, '.build/plugin-market-mobile.png') })
    const marketBounds = await market.boundingBox()
    assert.ok(marketBounds.width >= 280 && marketBounds.x >= 0 && marketBounds.x + marketBounds.width <= 375)
    const marketDialogBounds = await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).boundingBox()
    assert.ok(marketDialogBounds.y >= 0 && marketDialogBounds.y + marketDialogBounds.height <= 812)
    for (const card of await market.locator('article').all()) {
      const bounds = await card.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375)
      assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    }
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.getByRole('tab', { name: '账号', exact: true }).click()
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

    const gate = page.getByRole('dialog', { name: 'OwnDsh', exact: true })
    await gate.getByRole('button', { name: '修改 Server 地址', exact: true }).click()
    const address = gate.getByRole('textbox', { name: 'OwnDsh Server 地址', exact: true })
    await address.fill('https://next.example.com/path')
    await gate.getByRole('button', { name: '保存', exact: true }).click()
    await gate.getByRole('alert').waitFor()
    assert.equal(await address.inputValue(), 'https://next.example.com/path')
    await address.fill('https://next.example.com')
    await gate.getByRole('button', { name: '保存', exact: true }).click()
    await address.waitFor({ state: 'hidden' })
    await gate.getByText('https://next.example.com', { exact: true }).waitFor()
    await gate.getByRole('button', { name: '登录企业账号', exact: true }).click()
    await gate.getByRole('button', { name: '取消登录', exact: true }).waitFor()
    assert.equal(await gate.getByRole('button', { name: '修改 Server 地址', exact: true }).count(), 0)
    await gate.getByRole('button', { name: '取消登录', exact: true }).click()
    await gate.getByRole('button', { name: '修改 Server 地址', exact: true }).waitFor()

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
