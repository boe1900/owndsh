# app/

> L2 | 父级: ../CLAUDE.md

成员清单

console-shell.tsx: 基于 coss UI `SidebarProvider`/`Sidebar`/`SidebarHeader`/`SidebarContent`/`SidebarFooter`/`SidebarTrigger`/`SidebarInset`/`Avatar`/`Badge`/`Menu`/`Alert` 与 `AccountDialog` 的控制台主壳，左上展示 OwnDsh 鲸鱼品牌标识并紧邻放置侧栏收缩按钮，按 bootstrap 固定角色过滤并按模型、扩展、团队、个人四组组织导航，左下角底座收敛为单一当前成员头像菜单（头像实时绿点/在线计数、`displayName` + `email` 身份抬头、`WorkspaceDevicesMenuGroup` 远程连接分组、邀请成员、弹窗式用户中心与 Server 确认的 Sign out），并维护多标签打开/关闭/固定状态注入 `ConsoleTabBar`。
console-tabs.tsx: 基于 coss UI `SidebarTrigger`/`Separator`/`Menu`/`Popover`/`Dialog`/`InputGroup`/`Button` 与 `ThemeToggle` 的白底极简底线顶栏标签工作台，仅在移动端或侧边栏收起态于最左侧显示展开按钮，提供路线图标标签、固定标签置前、悬停关闭钮、右键菜单（固定/关闭/关闭其他/关闭右侧）、`+` 模块列表菜单、已打开标签总览和 `⌘K` 快速跳转命令面板。
console-tabs.test.tsx: 顶栏标签页排序/关闭、`+` 模块菜单、标签总览弹窗、右键上下文菜单与 `⌘K` 命令面板行为门禁。
product-routes.ts: 管理侧栏页面、全角色个人用量 `/usage` 与隐藏用户中心的路径、文案、Lucide 图标和固定角色矩阵唯一静态真源，活动记录仅面向企业管理员、模型管理员与审计员，多角色取并集；无管理路由的已登录员工默认落入 `/usage`，远程设备入口收纳于左下角头像账号菜单。
router.tsx: 创建并注册 TanStack Router 类型，消费生成 routeTree 且不读取 Server 菜单。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
