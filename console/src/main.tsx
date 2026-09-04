/**
 * [INPUT]: 依赖 React DOM、TanStack Query/Router、Inter/JetBrains Mono 与上游 Beautiful UI 全量样式/主题同步器。
 * [OUTPUT]: 将产品控制台和 examples 路由挂载到 index.html。
 * [POS]: console 的 Vite 浏览器入口，只装配全局 provider 和主题运行时，不承载页面业务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { router } from './app/router';
import { ThemeSync } from './components/site/ThemeSync';
import './styles/beautiful-ui.css';
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
