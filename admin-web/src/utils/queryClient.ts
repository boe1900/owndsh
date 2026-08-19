/**
 * [INPUT]: 依赖 TanStack Query 缓存与请求调度能力
 * [OUTPUT]: 提供禁自动重试、禁焦点刷新且固定 staleTime 的共享 QueryClient
 * [POS]: utils 的服务端查询缓存策略真源，业务写入不在此处实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000
    }
  }
});
