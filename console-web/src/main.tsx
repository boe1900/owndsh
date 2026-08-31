/**
 * [INPUT]: 依赖 React DOM、TanStack Query、应用 Router、Inter 字体与 Beautiful UI 样式/主题同步器。
 * [OUTPUT]: 将新产品控制台挂载到 index.html 的 root 节点。
 * [POS]: console-web 的浏览器启动入口，只装配全局 provider，不承载页面业务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { router } from './app/router';
import { ThemeSync } from './ui/beautiful/theme-sync';
import './ui/beautiful/foundation.css';
import './styles/global.css';

const queryClient = new QueryClient();
const root = document.getElementById('root');

if (root === null) throw new Error('console root element is missing');

createRoot(root).render(
  <StrictMode>
    <ThemeSync />
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
