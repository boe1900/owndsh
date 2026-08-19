/**
 * [INPUT]: 依赖 Vitest、React jsdom 环境与源码 @ alias
 * [OUTPUT]: 提供管理端 Testing Library 单元/组件测试配置
 * [POS]: admin-web 的快速测试入口，与 Umi 生产构建配置隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true
  }
});
