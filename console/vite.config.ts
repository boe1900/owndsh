/**
 * [INPUT]: 依赖 Node URL、Vite React/Tailwind、TanStack Router 文件路由生成器和 Vitest。
 * [OUTPUT]: 提供标准 Vite 构建、@ 源码别名、TanStack 自动分包、62209 开发服务、62207 API/验证码/健康代理与 jsdom 测试配置。
 * [POS]: console 的唯一构建入口，把 Beautiful UI 的 Next `@/` 引用无损映射到 Vite src。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 62209,
    strictPort: true,
    proxy: {
      '/enterprise': {
        target: process.env.CONSOLE_API_ORIGIN ?? 'https://127.0.0.1:62207',
        secure: false
      },
      '/auth': {
        target: process.env.CONSOLE_API_ORIGIN ?? 'https://127.0.0.1:62207',
        secure: false
      },
      '/healthz': {
        target: process.env.CONSOLE_API_ORIGIN ?? 'https://127.0.0.1:62207',
        secure: false
      }
    }
  },
  test: {
    environment: 'jsdom'
  }
});
