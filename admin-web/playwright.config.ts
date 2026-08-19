/**
 * [INPUT]: 依赖 Playwright 与可覆盖的真实 HTTPS 管理端 base URL
 * [OUTPUT]: 提供 Chromium 串行企业管理 E2E、Umi 冷 chunk 等待、截图和 trace 配置
 * [POS]: admin-web 的真实 Server 验收入口，容纳开发态首次编译但不启动 mock API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  use: {
    baseURL: process.env.ENT_E2E_BASE_URL || 'https://127.0.0.1',
    ignoreHTTPSErrors: true,
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  outputDir: 'test-results/artifacts'
});
