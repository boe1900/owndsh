# application/

> L2 | 父级: ../CLAUDE.md

成员清单

AuthAuditMetadata.java: 登录/注销审计只允许固定 client 与身份源类型进入 metadata。
AuthFlowException.java: 平台认证状态机到第 17 节稳定错误码的失败边界。
AuthSources.java: 登录事务绑定的 CSRF 与 ACTIVE 公开身份源结果，不携带秘密配置。
CaptchaVerifier.java: LOCAL 登录到宿主验证码设施的原子消费端口，只返回统一成功/失败事实。
ExternalIdentityService.java: 按稳定 subject 解析 Member，未知外部身份依 JIT/LINK_ONLY 创建或拒绝，允许管理员显式目录导入，并按外部组缺失/空/非空三态同步产品用户组关系。
ExternalIdentityQueryService.java: 向管理端提供单个平台用户的脱敏外部身份摘要，不暴露 groups/claims/凭据。
IdentityAlreadyLinkedException.java: 外部 subject 或 source-user 唯一绑定冲突的稳定 ENT_IDENTITY_ALREADY_LINKED 异常。
IdentityChangeMetadata.java: 身份源与组映射变更的显式审计 metadata。
IdentityGroupMappingService.java: 外部组映射 keyset 查询、产品用户组校验、创建/删除 CAS、bootstrap revision 与审计事务。
AccessGroupService.java: 产品用户组 CRUD、手工成员整体替换、引用保护、revision/bootstrap revision 与审计事务编排。
IdentityLinkMetadata.java: 用户绑定审计的计数与部门冲突白名单 metadata。
IdentityLinkResult.java: 返回稳定 userId、是否新绑定和新建成员的最小结果。
LdapDirectoryService.java: 限定启用 LDAP 身份源的用户/组有界搜索，并在单人导入前按浏览器提交的 DN 重读目录事实。
IdentityUnlinkMetadata.java: USER_UNLINKED 只携带身份源类型与成员 revision 变化的审计白名单。
IdentityLoginContext.java: 登录绑定事务的 tenant、requestId、来源 IP 和 user-agent hash 信任上下文。
MemberDirectoryQueryService.java: 以有界批量 SQL 聚合成员列表/详情、固定角色、脱敏身份、设备和 Session 摘要，隔离部门/岗位。
MemberManagementException.java: 最后有效企业管理员、最后可用登录方式和 LOCAL 解绑的封闭成员治理错误。
MemberManagementService.java: 以行锁创建 ACTIVE/employee LOCAL 成员并强制首次改密，编排当前用户凭旧密码改密及会话撤销，同时以 revision CAS 治理角色、状态和外部身份。
IdentityMutationContext.java: 管理写事务的 tenant、actor 与审计关联上下文。
IdentityResourceNotFoundException.java: tenant 限定身份资源不存在边界。
IdentitySourceService.java: 身份源 keyset、JIT/LINK_ONLY、秘密加密、资源 CAS、连接检查、bootstrap revision 与审计事务。
IdentitySourceSpec.java: 不含 client secret/manager password 且明确 provisioning mode 的身份源写规格。
IssuedPlatformSession.java: Sa-Token adapter 返回的 opaque Token 与绝对有效秒数。
PasswordChangeRequiredException.java: 携带轮换的一次性 challenge，要求页面进入无初始凭据的 LOCAL 改密步骤。
PlatformAuthorizationService.java: authorize/password/OIDC/code exchange/refresh/logout 与成员身份绑定的共用状态机，Desktop code 成功后签发 Refresh Session。
PlatformSession.java: 从服务端 Token/terminal 读取的可信 user/client/device 请求事实。
PlatformSessionGateway.java: 12 小时非共享 Sa-Token Access Session 签发、当前会话与单 installation/user 撤销端口。
PlatformSessionRevokedException.java: adapter 已确认 Token 因设备撤销失效的无敏感字段信号，由设备 Web 边界决定协议映射。
PublicIdentitySource.java: ACTIVE 身份源的 id/name/type 公开选择投影。
SecretInput.java: 一次性 char[] 秘密容器，使用后显式清零。
RefreshSessionService.java: 以 PostgreSQL 行锁编排 30 天 Refresh Token 摘要签发、单次轮换、重放 family 吊销与 Access Session 补偿撤销。
TokenExchangeResult.java: Token endpoint 的 opaque Access/Refresh Token、各自 TTL、Bearer 类型与固定 client 响应。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
