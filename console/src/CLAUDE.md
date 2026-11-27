# src/

> L2 | 父级: ../CLAUDE.md

成员清单

main.tsx: 浏览器装配入口，挂载 QueryClient、唯一 Router、主题同步（`bui-theme`）与 coss UI 全局样式。
routeTree.gen.ts: TanStack Router 从 routes 文件生成的路由树，禁止手工编辑。
app/: 全局应用装配；局部地图见 app/CLAUDE.md。
api/: OpenAPI 生成客户端边界；局部地图见 api/CLAUDE.md。
auth/: enterprise-admin HttpOnly Cookie 会话与 PKCE 状态机；局部地图见 auth/CLAUDE.md。
components/: coss UI 原生组件与产品级共享适配器；局部地图见 components/CLAUDE.md。
features/: 产品业务纵向切片；局部地图见 features/CLAUDE.md。
hooks/: coss UI 配套 React Hook；局部地图见 hooks/CLAUDE.md。
lib/: HTTP/HTTPS 通用随机标识与 className 合并支撑层；局部地图见 lib/CLAUDE.md。
routes/: 登录/回调/403 与受保护产品路由；局部地图见 routes/CLAUDE.md。
styles/: 全局视觉基础（Tailwind CSS v4 + coss UI tokens）；局部地图见 styles/CLAUDE.md。
test/: Vitest 全局 setupFiles 入口；局部地图见 test/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
