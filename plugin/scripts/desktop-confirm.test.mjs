/**
 * [INPUT]: 依赖内置 Harness/插件运行树与 Playwright，使用临时 profile 并拦截账号动作 API
 * [OUTPUT]: 验证账号编辑与确认，覆盖原型卡片/精简详情、四色气泡、减少动态效果、固定版本安装/更新确认、重启和明暗/窄屏布局
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
    const calls = { logout: 0, uninstall: 0, installPlugin: 0, updatePlugin: 0, removePlugin: 0, refresh: 0, restart: 0 }
    const installation = (name, version, displayName, category, description) => ({
      spec: `${name}@${version}`, displayName, description, author: 'OwnDsh',
      repositoryUrl: 'https://github.com/example/plugins', categories: [category],
    })
    const pluginStatus = {
      canRestart: true,
      assignmentRevision: 1,
      catalog: [
        { packageName: '@enterprise/code-review', pluginVersionId: '881', version: '1.2.0', installation: installation('@enterprise/code-review', '1.2.0', '代码审查', '开发工具', '检查代码变更，发现潜在问题，生成清晰的审查建议。支持从架构设计、边界条件、安全防护到性能优化的完整审查，帮助团队在合并代码前识别风险并记录可执行的修复建议。') },
        { packageName: '@enterprise/knowledge-base', pluginVersionId: '882', version: '2.0.0', installation: installation('@enterprise/knowledge-base', '2.0.0', '知识库', '知识管理', '连接团队文档与内部知识，让每一次回答都有据可依。') },
        { packageName: '@enterprise/report-export', pluginVersionId: '883', version: '1.0.0', installation: installation('@enterprise/report-export', '1.0.0', '报表导出', '开发工具', '将分析结果整理为结构化报表，一键导出并与团队分享。'), installErrorCode: 'ENT_PLUGIN_INCOMPATIBLE' },
        { packageName: '@enterprise/session-memory', pluginVersionId: '884', version: '1.3.0', installation: installation('@enterprise/session-memory', '1.3.0', '会话记忆', '知识管理', '记住项目背景与工作偏好，在新的会话中延续上下文。') },
      ],
      plugins: [
        { packageName: '@enterprise/knowledge-base', version: '1.0.0', pluginVersionId: '880', desiredRevision: 1, desiredState: 'INSTALLED', state: 'ACTIVE', lastErrorCode: null, restartMarker: null },
        { packageName: '@enterprise/session-memory', version: '1.3.0', pluginVersionId: '884', desiredRevision: 1, desiredState: 'INSTALLED', state: 'ACTIVE', lastErrorCode: null, restartMarker: null },
      ],
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
      else if (path === 'mcp') data = { assignments: [] }
      else if (path === 'restart') { calls.restart++; data = { restartRequested: true } }
      else if (path === 'install' && route.request().postDataJSON().packageName === '@enterprise/knowledge-base') {
        assert.deepEqual(route.request().postDataJSON(), { packageName: '@enterprise/knowledge-base', pluginVersionId: '882' })
        calls.updatePlugin++
        Object.assign(pluginStatus.plugins.find(plugin => plugin.packageName === '@enterprise/knowledge-base'), { version: '2.0.0', pluginVersionId: '882', state: 'RESTART_REQUIRED' })
        data = pluginStatus
      }
      else if (path === 'install') {
        assert.deepEqual(route.request().postDataJSON(), { packageName: '@enterprise/code-review', pluginVersionId: '881' })
        calls.installPlugin++
        pluginStatus.plugins.push({ packageName: '@enterprise/code-review', version: '1.2.0', pluginVersionId: '881', desiredRevision: 1, desiredState: 'INSTALLED', state: 'RESTART_REQUIRED', lastErrorCode: null, restartMarker: 'test-run' })
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
    await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
    await page.getByText('OwnDsh 设置', { exact: true }).click()
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
    await market.getByText('代码审查', { exact: true }).waitFor()
    assert.equal(calls.installPlugin, 0)
    const cardFor = name => market.locator(`[data-enterprise-plugin-package="@enterprise/${name}"]`)
    for (const [name, tone, text] of [
      ['code-review', 'uninstalled', '未安装'], ['knowledge-base', 'update', '有新版本待更新'],
      ['report-export', 'unavailable', '环境不兼容'], ['session-memory', 'enabled', '已启用'],
    ]) {
      const indicator = cardFor(name).locator('.own-market-status')
      assert.equal(await indicator.locator('.own-market-dot').getAttribute('data-tone'), tone)
      await indicator.hover()
      await page.getByRole('tooltip').filter({ hasText: text }).waitFor()
      await page.mouse.move(0, 0)
      await indicator.focus()
      await page.getByRole('tooltip').filter({ hasText: text }).waitFor()
      await page.keyboard.press('Tab')
    }
    const updateDot = cardFor('knowledge-base').locator('.own-market-status .own-market-dot')
    assert.equal(await updateDot.evaluate(el => getComputedStyle(el).animationName), 'own-market-update')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await updateDot.evaluate(el => getComputedStyle(el).animationName), 'none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const cards = await market.locator('.own-market-card').all()
    const cardBounds = await Promise.all(cards.map(card => card.boundingBox()))
    assert.ok(Math.abs(cardBounds[0].y - cardBounds[1].y) < 1, 'Desktop cards must use two columns')
    assert.ok(cardBounds.every(bound => Math.abs(bound.height - cardBounds[0].height) < 1), 'Short and long descriptions must have equal card heights')
    assert.equal(await cardFor('code-review').locator('.own-market-description').evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight === 40), true)
    const browse = await market.locator('.own-market-tabs').boundingBox()
    const search = await market.getByRole('searchbox').boundingBox()
    assert.ok(Math.abs((browse.y + browse.height / 2) - (search.y + search.height / 2)) < 2, 'Search and view selector must share a row')
    assert.equal(await cardFor('code-review').locator('.own-market-card-action').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(15, 23, 42)')
    assert.equal(await cardFor('knowledge-base').locator('.own-market-card-action').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 251, 235)')
    await market.getByRole('searchbox').focus()
    await page.mouse.move(0, 0)
    await mkdir(join(root, '.build'), { recursive: true })
    await page.screenshot({ path: join(root, '.build/plugin-market-desktop.png'), animations: 'disabled' })
    await cardFor('knowledge-base').locator('.own-market-status').hover()
    await page.getByRole('tooltip').filter({ hasText: '有新版本待更新' }).waitFor()
    await page.screenshot({ path: join(root, '.build/plugin-market-tooltip.png'), animations: 'disabled' })
    await page.mouse.move(0, 0)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(root, '.build/plugin-market-dark.png'), animations: 'disabled' })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByRole('tab', { name: '插件', exact: true }).scrollIntoViewIfNeeded()
    await market.getByRole('button', { name: '全部插件', exact: true }).click({ trial: true })
    await market.getByRole('button', { name: '刷新插件', exact: true }).click({ trial: true })
    await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true })
        .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {})))
    })
    await page.screenshot({ path: join(root, '.build/plugin-market-mobile.png') })
    await page.setViewportSize({ width: 1400, height: 900 })
    const unavailable = market.locator('[data-enterprise-plugin-package="@enterprise/report-export"]')
    await unavailable.click()
    const unavailableDetail = page.getByRole('dialog', { name: '报表导出', exact: true })
    assert.equal(await unavailableDetail.getByRole('button', { name: '确认安装', exact: true }).isDisabled(), true)
    await unavailableDetail.getByText('安装地址不可用，或实际包名、版本、插件入口与配置不符', { exact: true }).waitFor()
    await unavailableDetail.getByRole('button', { name: '关闭', exact: true }).click()
    await market.getByRole('button', { name: '已安装 (2)', exact: true }).click()
    assert.equal(await market.locator('.own-market-card').count(), 2)
    await market.getByRole('button', { name: '全部插件', exact: true }).click()
    await market.getByRole('button', { name: '知识管理', exact: true }).click()
    assert.equal(await market.locator('.own-market-card').count(), 2)
    await market.getByRole('button', { name: '全部分类', exact: true }).click()
    await market.getByRole('searchbox', { name: '搜索企业插件' }).fill('code-review')
    assert.equal(await market.locator('.own-market-card').count(), 1)
    await market.getByText('代码审查', { exact: true }).click()
    const detail = page.getByRole('dialog', { name: '代码审查', exact: true })
    await detail.waitFor()
    await detail.getByRole('heading', { name: '功能说明', exact: true }).waitFor()
    await detail.getByText(pluginStatus.catalog[0].installation.description, { exact: true }).waitFor()
    assert.equal((await detail.innerText()).includes(pluginStatus.catalog[0].installation.spec), false, 'Details must not expose the installation target')
    for (const field of ['企业版本', '本机版本', '安装目标', '生效方式']) assert.equal(await detail.getByText(field, { exact: true }).count(), 0)
    await page.screenshot({ path: join(root, '.build/plugin-detail-desktop.png'), animations: 'disabled' })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(root, '.build/plugin-detail-dark.png'), animations: 'disabled' })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 375, height: 812 })
    await detail.getByRole('button', { name: '确认安装', exact: true }).click({ trial: true })
    const detailBounds = await detail.boundingBox()
    assert.ok(detailBounds.x >= 0 && detailBounds.x + detailBounds.width <= 375)
    assert.equal(await detail.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    await page.screenshot({ path: join(root, '.build/plugin-detail-mobile.png') })
    await page.setViewportSize({ width: 1400, height: 900 })
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Tab')
      assert.equal(await detail.evaluate(element => element.contains(document.activeElement)), true)
    }
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'hidden' })
    assert.equal(await market.isVisible(), true, 'Escape must leave the Settings Plugins tab open')
    await market.getByRole('button', { name: '安装: 代码审查', exact: true }).click()
    await detail.waitFor()
    assert.equal(calls.installPlugin, 0, 'Card action must only open details')
    assert.equal(await detail.getByRole('link', { name: '查看源码' }).getAttribute('href'), 'https://github.com/example/plugins')
    await detail.getByRole('button', { name: '确认安装', exact: true }).click()
    await detail.waitFor({ state: 'hidden' })
    await market.getByText('等待重启', { exact: true }).waitFor()
    await market.getByRole('button', { name: '稍后重启', exact: true }).click()
    assert.equal(calls.restart, 0)
    assert.equal(calls.installPlugin, 1)
    pluginStatus.plugins.find(plugin => plugin.packageName === '@enterprise/code-review').state = 'ACTIVE'
    await market.getByRole('button', { name: '刷新插件', exact: true }).click()
    await market.getByRole('button', { name: '已启用: 代码审查', exact: true }).click()
    const removePlugin = detail.getByRole('button', { name: '卸载 @enterprise/code-review', exact: true })
    await removePlugin.waitFor()
    await removePlugin.click()
    const pluginConfirmation = page.getByRole('dialog', { name: '卸载企业插件', exact: true })
    await pluginConfirmation.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(calls.removePlugin, 0)
    await removePlugin.click()
    await pluginConfirmation.getByRole('button', { name: '确认卸载', exact: true }).click()
    await market.getByText('等待重启', { exact: true }).waitFor()
    assert.equal(calls.removePlugin, 1)
    await market.getByRole('button', { name: '立即重启', exact: true }).click()
    assert.equal(calls.restart, 1)
    await market.getByRole('button', { name: '刷新插件', exact: true }).click()
    assert.equal(calls.installPlugin, 1)
    await market.getByRole('searchbox', { name: '搜索企业插件' }).fill('')
    await market.getByRole('button', { name: '更新到 2.0.0: 知识库', exact: true }).click()
    const updateDetail = page.getByRole('dialog', { name: '知识库', exact: true })
    assert.equal(calls.updatePlugin, 0, 'Update must require confirmation')
    await updateDetail.getByText('v1.0.0 → v2.0.0', { exact: true }).waitFor()
    await updateDetail.getByRole('button', { name: '确认更新', exact: true }).click()
    await cardFor('knowledge-base').getByRole('button', { name: '等待重启: 知识库', exact: true }).waitFor()
    assert.equal(calls.updatePlugin, 1)
    assert.equal(await cardFor('knowledge-base').locator('.own-market-status .own-market-dot').getAttribute('data-tone'), 'pending')
    await market.getByRole('searchbox').fill('没有匹配的插件')
    await market.getByRole('button', { name: '重置筛选', exact: true }).click()
    assert.equal(await market.locator('.own-market-card').count(), 4)
    await page.setViewportSize({ width: 375, height: 812 })
    await market.getByRole('searchbox', { name: '搜索企业插件' }).scrollIntoViewIfNeeded()
    // 等待宿主侧栏收起动画结束，并确认右侧控件未被裁切或遮挡。
    await market.getByRole('button', { name: '刷新插件', exact: true }).click({ trial: true })
    await page.screenshot({ path: join(root, '.build/plugin-market-mobile-pending.png'), animations: 'disabled' })
    const marketBounds = await market.boundingBox()
    assert.ok(marketBounds.width >= 280 && marketBounds.x >= 0 && marketBounds.x + marketBounds.width <= 375)
    const marketDialogBounds = await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).boundingBox()
    assert.ok(marketDialogBounds.y >= 0 && marketDialogBounds.y + marketDialogBounds.height <= 812)
    for (const card of await market.locator('.own-market-card').all()) {
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
