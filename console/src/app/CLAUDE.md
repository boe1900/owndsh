# app/

> L2 | 父级: ../CLAUDE.md

成员清单

console-shell.tsx: 复用上游 SidebarNav、ThemeToggle 和 Harness tab/window 结构，以 OwnDsh 名称和鲸鱼图标标识管理入口，按 bootstrap 固定角色过滤并按模型、扩展、团队三组组织导航，正文插槽承载本人远程设备分组并新标签打开独立原生 DSH document，账号菜单提供邀请成员、用户中心与 Server 确认的 Sign out；组件示例保留独立路由，账号菜单不提供设备或示例入口。
product-routes.ts: 管理侧栏页面与隐藏用户中心的路径、文案、Lucide 图标和固定角色矩阵唯一静态真源，`/remote` 文案为远程诊断，多角色取并集；无管理路由的已登录员工进入用户中心。
router.tsx: 创建并注册 TanStack Router 类型，消费生成 routeTree 且不读取 Server 菜单。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
