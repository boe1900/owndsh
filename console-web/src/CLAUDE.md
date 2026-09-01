# src/

> L2 | 父级: ../CLAUDE.md

成员清单

main.tsx: 浏览器装配入口，挂载 QueryClient、唯一 Router、上游主题与全局字体样式。
routeTree.gen.ts: TanStack Router 从 routes 文件生成的路由树，禁止手工编辑。
app/: 全局应用装配；局部地图见 app/CLAUDE.md。
api/: OpenAPI 生成客户端边界；局部地图见 api/CLAUDE.md。
auth/: enterprise-admin 标签页会话与 PKCE 状态机；局部地图见 auth/CLAUDE.md。
components/: 从锁定 Beautiful UI commit 迁移的共享原子、复合组件与 Harness；局部地图见 components/CLAUDE.md。
examples/: 组件画廊与完整 Harness 可执行参考；局部地图见 examples/CLAUDE.md。
features/: 产品业务纵向切片；局部地图见 features/CLAUDE.md。
lib/: 上游组件注册表、元数据与 class 合并支撑层；局部地图见 lib/CLAUDE.md。
routes/: 登录/回调/403、受保护产品 pathless layout 与独立 examples 静态路由；局部地图见 routes/CLAUDE.md。
styles/: 全局视觉基础；局部地图见 styles/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
