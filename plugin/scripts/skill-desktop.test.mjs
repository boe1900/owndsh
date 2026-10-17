/**
 * [INPUT]: 依赖显式 OWNDSH_E2E_LAUNCH_URL 的真实 DSH Web Host、Playwright 与已登录的 OwnDsh Server 会话
 * [OUTPUT]: 验证 OwnDsh 技能可安装/已安装视图、技能动作、卸载和手动安装，并保存截图/JSON 证据
 * [POS]: scripts 的真实技能 UI E2E；不创建默认 profile、不扫描用户目录，现场目录由 OWNDSH_E2E_SCENE 显式指定
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

const launchUrl = process.env.OWNDSH_E2E_LAUNCH_URL
const scene = process.env.OWNDSH_E2E_SCENE
const skillName = process.env.OWNDSH_E2E_SKILL_NAME ?? 'yt-dlp-downloader'
const playwrightModule = process.env.OWNDSH_PLAYWRIGHT_MODULE ?? 'playwright'
const browserPath = process.env.OWNDSH_E2E_BROWSER_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

assert.ok(launchUrl, 'Set OWNDSH_E2E_LAUNCH_URL to an already running DSH Web Host')
assert.ok(scene, 'Set OWNDSH_E2E_SCENE to the persistent E2E evidence directory')

const playwright = await import(playwrightModule)
const { chromium } = playwright.default ?? playwright

async function localJson(page, path, init) {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, init)
    return { status: response.status, body: await response.json() }
  }, { path, init })
}

test('OwnDsh skill settings uses the real Host and published catalog artifact', { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const evidence = {
    launchUrl,
    skillName,
    checks: {},
    startedAt: new Date().toISOString(),
  }
  try {
    await page.goto(launchUrl)
    await page.waitForTimeout(800)
    const continuePreview = page.getByRole('button', { name: '继续', exact: true })
    if (await continuePreview.count() > 0 && await continuePreview.isVisible()) await continuePreview.click()
    await page.waitForTimeout(300)
    const apiPrompt = page.getByRole('dialog', { name: '添加一个 API Key 开始使用', exact: true })
    if (await apiPrompt.count() > 0 && await apiPrompt.isVisible()) {
      await apiPrompt.getByRole('button', { name: '稍后配置', exact: true }).click()
    }
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: 'OwnDsh 设置', exact: true }).click()
    await page.getByRole('tab', { name: '技能', exact: true }).click()

    const market = page.getByRole('region', { name: 'OwnDsh 技能', exact: true })
    const search = market.getByRole('searchbox', { name: '搜索技能', exact: true })
    const installedTab = market.getByRole('tab', { name: '已安装', exact: true })
    const availableTab = market.getByRole('tab', { name: '可安装', exact: true })
    assert.equal(await installedTab.count(), 1)
    assert.equal(await availableTab.count(), 1)
    const card = market.locator(`[data-skill-name="${skillName}"]`)
    await localJson(page, '/enterprise/api/v1/local/refresh', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    await page.waitForTimeout(800)
    for (let attempt = 0; attempt < 3 && await card.count() === 0; attempt++) {
      await market.getByRole('button', { name: '刷新', exact: true }).click()
      await page.waitForTimeout(800)
    }
    await card.waitFor({ timeout: 20_000 })
    evidence.checks.skillTab = true
    evidence.checks.skillViews = true
    evidence.checks.initialSkill = (await card.innerText()).includes(skillName)

    await search.fill(skillName)
    assert.equal(await market.locator(`[data-skill-name="${skillName}"]`).count(), 1)
    await search.fill('__missing_skill__')
    await market.getByText('暂无匹配的技能。', { exact: true }).waitFor()
    await search.fill(skillName)
    evidence.checks.search = true

    const toggle = card.getByRole('switch')
    const enabledBefore = await toggle.getAttribute('aria-checked')
    await toggle.click()
    await page.waitForTimeout(400)
    assert.notEqual(await card.getByRole('switch').getAttribute('aria-checked'), enabledBefore)
    await card.getByRole('switch').click()
    await page.waitForTimeout(400)
    assert.equal(await card.getByRole('switch').getAttribute('aria-checked'), enabledBefore)
    evidence.checks.enableDisable = true

    const openMenu = async () => {
      await card.getByRole('button', { name: `打开 ${skillName} 操作菜单`, exact: true }).click()
      const menu = page.getByRole('menu')
      await menu.waitFor()
      return menu
    }
    let menu = await openMenu()
    for (const label of ['编辑', '打开文件夹', '卸载']) {
      assert.equal(await menu.getByRole('menuitem', { name: label, exact: true }).isVisible(), true)
    }
    evidence.checks.menu = true
    await menu.getByRole('menuitem', { name: '编辑', exact: true }).click()
    menu = await openMenu()
    await menu.getByRole('menuitem', { name: '打开文件夹', exact: true }).click()
    menu = await openMenu()
    evidence.checks.nativeActions = true

    const installedMarket = market
    const installedCard = installedMarket.locator(`[data-skill-name="${skillName}"]`)

    await menu.getByRole('menuitem', { name: '卸载', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: '卸载技能', exact: true })
    await confirm.getByRole('button', { name: '确认卸载', exact: true }).click()
    await installedCard.waitFor({ state: 'detached', timeout: 15_000 })
    const afterRemove = await localJson(page, '/enterprise/api/v1/local/skills')
    assert.deepEqual(afterRemove.body.data.skills, [])
    evidence.checks.uninstall = true

    await installedMarket.getByRole('tab', { name: '可安装', exact: true }).click()
    const availableCard = installedMarket.locator(`[data-skill-name="${skillName}"]`)
    await availableCard.waitFor({ timeout: 15_000 })
    assert.equal(await availableCard.getByRole('button', { name: '安装', exact: true }).isVisible(), true)
    evidence.checks.availableAfterUninstall = true
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'GET'
        && response.url().endsWith('/enterprise/api/v1/local/skills')),
      availableCard.getByRole('button', { name: '安装', exact: true }).click(),
    ])
    await installedMarket.getByRole('tab', { name: '已安装', exact: true }).click()
    await installedMarket.locator(`[data-skill-name="${skillName}"]`).waitFor({ timeout: 20_000 })
    const afterRestore = await localJson(page, '/enterprise/api/v1/local/skills')
    assert.equal(afterRestore.body.data.skills.some(item => item.name === skillName), true)
    evidence.checks.install = true

    await mkdir(join(scene, 'artifacts'), { recursive: true })
    await page.screenshot({ path: join(scene, 'artifacts', 'skills-page.png'), fullPage: true })
    await writeFile(join(scene, 'result.json'), `${JSON.stringify({ ...evidence, finishedAt: new Date().toISOString() }, null, 2)}\n`)
  } catch (error) {
    await mkdir(join(scene, 'artifacts'), { recursive: true })
    await page.screenshot({ path: join(scene, 'artifacts', 'skills-failure.png'), fullPage: true }).catch(() => undefined)
    await writeFile(join(scene, 'failure.txt'), `${String(error)}\n${await page.locator('body').innerText().catch(() => '')}`)
    throw error
  } finally {
    await browser.close()
  }
})
