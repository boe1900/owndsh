# app/

> L2 | 父级: ../CLAUDE.md

成员清单

console-shell.tsx: 复用上游 SidebarNav、ThemeToggle 和 Harness tab/window 结构，按 bootstrap 固定角色过滤导航，在标签栏固定深浅主题切换，并在工作区菜单末尾提供用户中心与 Server 确认的 Sign out；不接管服务端会话或提供后台式设置入口。
product-routes.ts: 五个侧栏页面与隐藏用户中心的路径、文案、Lucide 图标和固定角色矩阵唯一静态真源，多角色取并集。
router.tsx: 创建并注册 TanStack Router 类型，消费生成 routeTree 且不读取 Server 菜单。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
