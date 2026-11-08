/**
 * [INPUT]: 依赖 Node URL、Vite React/Tailwind、TanStack Router 文件路由生成器和 Vitest。
 * [OUTPUT]: 提供标准 Vite 构建、@ 源码别名、TanStack 自动分包、62209 开发服务、62207 API/验证码/健康代理、8090 Remote WebSocket Upgrade 代理（PKCE 回调路由精确承接为本机 SPA）与 jsdom 测试配置（src/test/setup.ts 统一异步查询预算、单测 15s 超时）。
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
      ...Object.fromEntries(['/enterprise', '/auth', '/healthz'].map(path => [path, {
        // 远端目标按域名路由，changeOrigin 把 Host 头改写为目标主机；本机默认目标同名，无影响。
        // 连远端调试需服务端配置 ENT_CONSOLE_DEV_ORIGINS 放行本地 origin（仅 loopback），见 deploy compose。
        target: process.env.CONSOLE_API_ORIGIN ?? 'https://127.0.0.1:62207',
        secure: false,
        changeOrigin: true,
        // 与部署 nginx 的 `location = /enterprise/auth/callback` 同构：
        // 前端 PKCE 回调路由与后端共享 /enterprise 命名空间，回调页必须由本机 SPA 承接而非代理到后端。
        bypass: path === '/enterprise'
          ? (req: { url?: string }) => ((req.url ?? '').split('?')[0] === '/enterprise/auth/callback' ? '/index.html' : undefined)
          : undefined
      }])),
      '/remote': {
        target: process.env.CONSOLE_REMOTE_ORIGIN ?? 'http://127.0.0.1:8090',
        ws: true,
        secure: false,
        changeOrigin: true,
      },
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15_000
  }
});
