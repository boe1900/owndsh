# application/

> L2 | 父级: ../CLAUDE.md

成员清单

ExternalIdentityService.java: 在单事务内按稳定 subject 解析/创建/显式绑定用户，同步白名单 profile 和组映射且不自动授予角色。
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
SecretInput.java: 一次性 char[] 秘密容器，使用后显式清零。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
