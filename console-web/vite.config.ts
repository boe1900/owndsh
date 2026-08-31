/**
 * [INPUT]: 依赖 Vite React 插件、TanStack Router 文件路由生成器和 Vitest。
 * [OUTPUT]: 提供控制台开发、生产构建与 jsdom 测试的统一配置。
 * [POS]: console-web 的构建入口，固定本地端口并让路由树由源码目录生成。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  server: {
    host: '127.0.0.1',
    port: 62209,
    strictPort: true
  },
  test: {
    environment: 'jsdom'
  }
});
