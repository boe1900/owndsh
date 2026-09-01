# web/

> L2 | 父级: ../CLAUDE.md

成员清单

AdminGroupMappingController.java: 外部组映射 cursor list/create/delete 管理入口，统一 ent:identity 权限与 revision/idempotency headers。
AdminExternalIdentityController.java: RuoYi 用户扩展的外部身份摘要只读入口，要求 ent:identity:read。
AdminIdentitySourceController.java: 身份源 cursor list/get/create/update/test/enable/disable 管理入口，只返回脱敏 view。
AdminMemberController.java: 产品成员 cursor/list/detail、状态、固定角色、身份解绑与绑定事务入口，以独立 read/write 权限、revision CAS 和新鲜认证保护成员治理。
AuthSourcesView.java: 登录事务 CSRF 与公开身份源的 JSON 投影，snowflake ID 固定序列化为字符串。
ConsoleBootstrapController.java: 当前 enterprise-admin 会话的产品成员、启用的五种固定角色、权限码与部署标识入口，明确排除停用角色、菜单树和部门。
DeletedResourceView.java: CAS 删除成功的 id/deleted 白名单 DTO。
EnterpriseRequestContext.java: 服务端固定 tenant、Sa-Token actor 与脱敏请求关联信息。
EnterpriseAuthResourceConfiguration.java: 显式映射依赖 jar 内 login.html/css/js，授权跳转只公开三项认证资源而不暴露目录。
ExternalIdentitySummaryView.java: source/name/type、稳定 subject 和最后登录的管理协议白名单 DTO。
GroupMappingCreateRequest.java: 字符串 snowflake ID 输入解析和外部组写 DTO。
GroupMappingView.java: 外部组映射公开管理字段投影。
IdentityAdminRequestContextResolver.java: Controller 到可信管理请求上下文的 DIP 端口。
IdentitySourceView.java: 隔离 encryptedSecret/异常正文，只公开 JIT/LINK_ONLY、secretConfigured 与最近脱敏测试结果的身份源响应投影。
IdentitySourceWriteRequest.java: 接收 JIT/LINK_ONLY 与一次性 char[] secret、显式清零并提供脱敏字符串输出的写 DTO。
PlatformAuthController.java: authorize/sources/password/OIDC/token/logout 门面；普通成功保留 303，页面 JSON 以 CHANGE_PASSWORD challenge 或精确回调驱动两阶段流程，非 JSON 改密 fail-closed。
RuoYiIdentityAdminRequestContextResolver.java: 从固定部署 tenant、RuoYi 会话与 Servlet 元数据构造管理请求上下文。
TokenExchangeRequest.java: authorization_code grant 的 client/redirect/verifier/installation JSON 输入边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
