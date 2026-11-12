# routes/

> L2 | 父级: ../CLAUDE.md

成员清单

__root.tsx: 产品 pathless layout 与 examples 共享的无视觉根出口。
_console.tsx: Cookie 认证布局允许所有登录成员进入用户中心和本人工作区菜单，管理页面仍经固定角色守卫，普通员工默认返回用户中心。
_console.account.tsx: 工作区菜单进入的独立用户中心父布局，不出现在主侧栏，以分区导航承载账号子页面。
_console.account.index.tsx: `/account` 基本信息子页面，展示 bootstrap 当前账号、角色和多登录来源。
_console.account.security.tsx: `/account/security` 安全设置子页面，承载本人 LOCAL 密码修改。
login.tsx: 唯一 React 凭据页，共用 LOCAL/LDAP/OIDC、验证码及首次改密；本次新鲜登录通过共享 PKCE 完成器续授原客户端事务，已有会话保留账号确认，身份绑定必须新鲜认证。
enterprise.auth.callback.tsx: OIDC 等回调通过共享 PKCE 完成器建立 HttpOnly Cookie，续授原客户端事务或恢复内部路由，以 replace 清除 code/state。
403.tsx: employee 或无任何控制台角色的固定拒绝页，提供服务端确认的 Sign out。
_console.index.tsx: 根路径模型路由，薄转发到 features/models 的 Provider、受管模型和模型集目录页面。
_console.access.tsx: 模型授权、Token 配额和速率限制真实产品页的薄路由入口。
_console.activity.tsx: 活动记录薄路由入口，转发到 features/activity 的权限分段与观测事实。
_console.members.tsx: 产品成员、扁平用户组与身份接入聚合目录的薄路由入口。
_console.plugins.tsx: `/plugins` 插件版本工作台的薄路由入口。
_console.skills.tsx: `/skills` 技能 release 导入、发布和撤销工作台的薄路由入口。
_console.mcp.tsx: `/mcp` 独立 MCP 服务与访问授权管理路由。
examples.tsx: `/examples` 的独立父出口，不挂载企业产品壳。
examples.index.tsx: 运行全部上游组件 demo 并展示同源源码。
examples.harness.tsx: 运行完整 Ice Cream Harness 交互基线。
-models-index-page.tsx: 模型根路径到真实 Provider/受管模型管理工作台的可测试适配层，前缀阻止路由生成器误收非路由源码。
-index.test.tsx: 在仅有 getRandomValues 的 HTTP 环境验证角色矩阵、会话、成员/组/LDAP、模型/授权/配额及插件分类登记、发布确认和 read/write 分权后的写入；锁定 UUID、双 revision 范围升级、自主安装与 Server 事实渲染。

authorize.tsx: 已有浏览器会话的公开客户端账号确认页，以用户名继续或拒绝；授权边界与新鲜登录共用，绑定展示 userId 防止其他标签换号。
authorized.tsx: 公开品牌交接页，只尝试固定 owndsh://open 唤回窗口；不接收凭据，不宣称 Host READY。
-authorization.test.tsx: 验证 employee 批准/拒绝传回原事务、已有会话不能凭 URL 跳过确认、未登录恢复目标与身份绑定不可复用浏览器身份。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
