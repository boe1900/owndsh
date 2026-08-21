# application/

> L2 | 父级: ../CLAUDE.md

成员清单

AuthAuditMetadata.java: 登录/注销审计只允许固定 client 与身份源类型进入 metadata。
AuthFlowException.java: 平台认证状态机到第 17 节稳定错误码的失败边界。
AuthSources.java: 登录事务绑定的 CSRF 与 ACTIVE 公开身份源结果，不携带秘密配置。
CaptchaVerifier.java: LOCAL 登录到宿主验证码设施的原子消费端口，只返回统一成功/失败事实。
ExternalIdentityService.java: 在单事务内按稳定 subject 解析/创建/显式绑定用户，同步白名单 profile 和组映射且不自动授予角色。
ExternalIdentityQueryService.java: 向管理端提供单个平台用户的脱敏外部身份摘要，不暴露 groups/claims/凭据。
IdentityAlreadyLinkedException.java: 外部 subject 或 source-user 唯一绑定冲突的稳定 ENT_IDENTITY_ALREADY_LINKED 异常。
IdentityChangeMetadata.java: 身份源与组映射变更的显式审计 metadata。
IdentityGroupMappingService.java: 组映射 keyset 查询、部门校验、创建/删除 CAS、bootstrap revision 与审计事务。
IdentityLinkMetadata.java: 用户绑定审计的计数与部门冲突白名单 metadata。
IdentityLinkResult.java: 返回稳定 userId、是否新绑定/新建用户和唯一部门映射结果。
IdentityLoginContext.java: 登录绑定事务的 tenant、requestId、来源 IP 和 user-agent hash 信任上下文。
IdentityMutationContext.java: 管理写事务的 tenant、actor 与审计关联上下文。
IdentityResourceNotFoundException.java: tenant 限定身份资源不存在边界。
IdentitySourceService.java: 身份源 keyset 查询、秘密加密、资源 CAS、连接检查、bootstrap revision 与审计事务。
IdentitySourceSpec.java: 不含 client secret/manager password 的身份源写规格。
IssuedPlatformSession.java: Sa-Token adapter 返回的 opaque Token 与绝对有效秒数。
PasswordChangeRequiredException.java: 携带轮换的一次性 challenge，要求页面进入无初始凭据的 LOCAL 改密步骤。
PlatformAuthorizationService.java: authorize/password/OIDC/token/logout 状态机；LOCAL 初始凭据认证后签发 5 分钟一次性改密 challenge，改密成功才消费事务并产生绑定和 60 秒 code。
PlatformSession.java: 从服务端 Token/terminal 读取的可信 user/client/device 请求事实。
PlatformSessionGateway.java: 12 小时非共享 Sa-Token 签发、当前会话与保留撤销原因的单 installation 撤销端口。
PlatformSessionRevokedException.java: adapter 已确认 Token 因设备撤销失效的无敏感字段信号，由设备 Web 边界决定协议映射。
PublicIdentitySource.java: ACTIVE 身份源的 id/name/type 公开选择投影。
SecretInput.java: 一次性 char[] 秘密容器，使用后显式清零。
TokenExchangeResult.java: Token endpoint 的 opaque access token、Bearer 类型、TTL 和固定 client 响应。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
