# web/

> L2 | 父级: ../CLAUDE.md

成员清单

AdminGroupMappingController.java: 外部组映射 cursor list/create/delete 管理入口，统一 ent:identity 权限与 revision/idempotency headers。
AccessGroupWriteRequest.java: 产品用户组名称与完整手工成员 ID 列表写入边界。
AccessGroupView.java: 用户组名称、手工成员 ID、有效成员数与 revision 管理投影。
AdminAccessGroupController.java: 用户组 list/get/create/update/delete 与成员权限入口。
AdminExternalIdentityController.java: Host 用户扩展的外部身份摘要只读入口，要求 ent:identity:read。
AdminIdentitySourceController.java: 身份源管理及 LDAP 用户/组有界搜索、单人导入入口，只返回脱敏字段并只接受 DN 作为导入事实。
AdminMemberController.java: LOCAL 成员幂等创建及产品成员 cursor/list/detail、状态、固定角色、身份解绑与绑定事务入口，初始密码只存在于可清零请求字符数组。
AuthSourcesView.java: 登录事务 CSRF 与公开身份源的 JSON 投影，snowflake ID 固定序列化为字符串。
ConsoleBootstrapController.java: 当前 enterprise-admin 会话的账号标识/用户名/邮箱/登录来源、启用的五种固定角色、ent:* 产品权限码与部署标识入口，明确排除外部 subject、旧后台权限、停用角色、菜单树和部门。
CurrentAccountController.java: 当前控制台成员凭旧 LOCAL 密码自助改密入口，成功后撤销该成员全部会话并删除浏览器 Cookie，拒绝管理员重置他人密码。
AdminSessionCookie.java: 根据外部地址在 HTTPS `__Host-enterprise-admin` 与 HTTP `enterprise-admin` 间选择，固定 HttpOnly/SameSite=Strict/host-only 与 4 KiB 值边界，并拒绝显式跨源写请求。
DeletedResourceView.java: CAS 删除成功的 id/deleted 白名单 DTO。
EnterpriseRequestContext.java: 服务端固定 tenant、Sa-Token actor 与脱敏请求关联信息。
EnterpriseAuthResourceConfiguration.java: 显式映射依赖 jar 内 login.html/css/js，授权跳转只公开三项认证资源而不暴露目录。
ExternalIdentitySummaryView.java: source/name/type、稳定 subject 和最后登录的管理协议白名单 DTO。
GroupMappingCreateRequest.java: 字符串 snowflake ID 输入解析和外部组写 DTO。
GroupMappingView.java: 外部组映射公开管理字段投影。
IdentityAdminRequestContextResolver.java: Controller 到可信管理请求上下文的 DIP 端口。
IdentitySourceView.java: 隔离 encryptedSecret/异常正文，只公开 JIT/LINK_ONLY、secretConfigured 与最近脱敏测试结果的身份源响应投影。
IdentitySourceWriteRequest.java: 接收 JIT/LINK_ONLY 与一次性 char[] secret、显式清零并提供脱敏字符串输出的写 DTO。
PlatformAuthController.java: HTTP(S) authorize/sources/password/OIDC/Desktop token/浏览器 Cookie/logout 门面；管理端专用交换不返回 Token，页面 JSON 以 CHANGE_PASSWORD 或精确回调驱动两阶段流程。
OwnDshIdentityAdminRequestContextResolver.java: 从固定部署 tenant、Host 会话与 Servlet 元数据构造管理请求上下文。
TokenExchangeRequest.java: authorization_code grant 的 client/redirect/verifier/installation JSON 输入边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
