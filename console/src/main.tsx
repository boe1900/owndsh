/**
 * [INPUT]: 依赖 React DOM、TanStack Query/Router、Inter/JetBrains Mono 与 coss UI 全局样式。
 * [OUTPUT]: 将产品控制台挂载到 index.html，并在挂载阶段同步持久化主题。
 * [POS]: console 的 Vite 浏览器入口，只装配全局 provider 和主题运行时，不承载页面业务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { router } from './app/router';
import './styles/global.css';

function ThemeSync() {
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('bui-theme') !== 'light');
    } catch {
      document.documentElement.classList.add('dark');
    }
  }, []);
  return null;
}

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
