# web/

> L2 | 父级: ../CLAUDE.md

成员清单

AdminGroupMappingController.java: 外部组映射 cursor list/create/delete 管理入口，统一 ent:identity 权限与 revision/idempotency headers。
AdminExternalIdentityController.java: RuoYi 用户扩展的外部身份摘要只读入口，要求 ent:identity:read。
AdminIdentitySourceController.java: 身份源 cursor list/get/create/update/test/enable/disable 管理入口，只返回脱敏 view。
AuthSourcesView.java: 登录事务 CSRF 与公开身份源的 JSON 投影，snowflake ID 固定序列化为字符串。
DeletedResourceView.java: CAS 删除成功的 id/deleted 白名单 DTO。
EnterpriseRequestContext.java: 服务端固定 tenant、Sa-Token actor 与脱敏请求关联信息。
EnterpriseAuthResourceConfiguration.java: 显式映射依赖 jar 内 login.html/css/js，授权跳转只公开三项认证资源而不暴露目录。
ExternalIdentitySummaryView.java: source/name/type、稳定 subject 和最后登录的管理协议白名单 DTO。
GroupMappingCreateRequest.java: 字符串 snowflake ID 输入解析和外部组写 DTO。
GroupMappingView.java: 外部组映射公开管理字段投影。
IdentityAdminRequestContextResolver.java: Controller 到可信管理请求上下文的 DIP 端口。
IdentitySourceView.java: 隔离 encryptedSecret/异常正文，只公开 secretConfigured 与最近脱敏测试结果的身份源响应投影。
IdentitySourceWriteRequest.java: 一次性 char[] secret、显式清零与脱敏字符串输出的写 DTO。
PlatformAuthController.java: authorize/sources/password/OIDC/token/logout 最小认证门面，密码/条件验证码表单只接受 HTTPS 并返回 303。
RuoYiIdentityAdminRequestContextResolver.java: 从固定部署 tenant、RuoYi 会话与 Servlet 元数据构造管理请求上下文。
TokenExchangeRequest.java: authorization_code grant 的 client/redirect/verifier/installation JSON 输入边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
