# routes/

> L2 | 父级: ../CLAUDE.md

成员清单

__root.tsx: 产品 pathless layout 与 examples 共享的无视觉根出口。
_console.tsx: 不改变 URL 的产品认证布局边界，直接以 HttpOnly Cookie 请求 bootstrap，经固定角色守卫后挂载 ConsoleShell，拒绝动态菜单和前端 Token 判断。
_console.account.tsx: 工作区菜单进入的独立用户中心父布局，不出现在主侧栏，以分区导航承载账号子页面。
_console.account.index.tsx: `/account` 基本信息子页面，展示 bootstrap 当前账号、角色和多登录来源。
_console.account.security.tsx: `/account/security` 安全设置子页面，承载本人 LOCAL 密码修改。
login.tsx: 采用 shadcn authentication 双栏构图与 Beautiful UI tokens 的管理端登录页，在同页承载 LOCAL/LDAP Tab、验证码和首次改密，并为每个 OIDC 身份源提供独立跳转按钮。
enterprise.auth.callback.tsx: 一次性消费 PKCE code/state 建立 HttpOnly Cookie，并以 replace 安全恢复内部目标路由。
403.tsx: employee 或无任何控制台角色的固定拒绝页，提供服务端确认的 Sign out。
_console.index.tsx: 根路径模型路由，薄转发到 features/models 的 Provider、受管模型和模型集目录页面。
_console.access.tsx: 模型授权、Token 配额和速率限制真实产品页的薄路由入口。
_console.activity.tsx: 活动记录薄路由入口，转发到 features/activity 的权限分段与观测事实。
_console.members.tsx: 产品成员、扁平用户组与身份接入聚合目录的薄路由入口。
_console.plugins.tsx: 插件版本、分配事实和设备状态真实产品页的薄路由入口。
examples.tsx: `/examples` 的独立父出口，不挂载企业产品壳。
examples.index.tsx: 运行全部上游组件 demo 并展示同源源码。
examples.harness.tsx: 运行完整 Ice Cream Harness 交互基线。
-models-index-page.tsx: 模型根路径到真实 Provider/受管模型管理工作台的可测试适配层，前缀阻止路由生成器误收非路由源码。
-index.test.tsx: 五角色矩阵、HttpOnly 会话交换、主题、用户中心子路由、成员/用户组/LDAP、模型/授权/配额及插件写入的最小集成门禁，锁定无 Authorization/Token 持久化、UUID 幂等键、CAS revision 与 Server 事实渲染。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
