# routes/

> L2 | 父级: ../CLAUDE.md

成员清单

__root.tsx: 产品 pathless layout 与 examples 共享的无视觉根出口。
_console.tsx: 不改变 URL 的产品认证布局边界，通过 Token/bootstrap/固定角色守卫后挂载 ConsoleShell，拒绝动态菜单。
login.tsx: 采用 shadcn authentication 双栏构图与 Beautiful UI tokens 的公开登录页，只发起 enterprise-admin PKCE。
enterprise.auth.callback.tsx: 一次性消费 PKCE code/state、写入当前标签页 Token 并安全恢复内部目标路由。
403.tsx: employee 或无任何控制台角色的固定拒绝页，提供服务端确认的 Sign out。
_console.index.tsx: 根路径模型路由，薄转发到 features/models 的真实目录页面。
_console.access.tsx: 模型授权、使用限额和速率限制真实产品页的薄路由入口。
_console.activity.tsx: 活动记录薄路由入口，转发到 features/activity 的权限分段与观测事实。
_console.members.tsx: 产品成员聚合目录的薄路由入口。
_console.plugins.tsx: 插件版本、分配事实和设备状态真实产品页的薄路由入口。
_console.settings.tsx: 设置薄路由入口，转发到 features/settings 的身份源与健康状态工作台。
examples.tsx: `/examples` 的独立父出口，不挂载企业产品壳。
examples.index.tsx: 运行全部上游组件 demo 并展示同源源码。
examples.harness.tsx: 运行完整 Ice Cream Harness 交互基线。
-models-index-page.tsx: 模型根路径到真实 Provider/受管模型管理工作台的可测试适配层，前缀阻止路由生成器误收非路由源码。
-index.test.tsx: 五角色矩阵、认证边界、全局主题、成员 cursor、模型/访问策略及插件查询写入的最小集成门禁，锁定 UUID 幂等键、CAS revision 与 Server 事实渲染，前缀阻止路由生成器误收测试文件。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
