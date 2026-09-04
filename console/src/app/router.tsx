/**
 * [INPUT]: 依赖 TanStack Router 与生成的 routeTree。
 * [OUTPUT]: 提供控制台唯一 Router 实例及类型注册。
 * [POS]: app 装配层的静态路由边界，替代旧管理端的服务端动态菜单路由。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRouter } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen';

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
