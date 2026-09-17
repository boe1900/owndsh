# audit/

> L2 | 父级: ../../CLAUDE.md

成员清单

AuditMetadataPolicyTest.java: 验证所有当前可写 action 的显式 DTO、秘密隔离与错配拒绝，旧插件上传/下载 action 只保留账本读取。
AuditIntegrationTest.java: 以真实 PostgreSQL 验证 requestId 关联查询、筛选、白名单 JSON 与 365 天批量 retention。
UserGovernanceAuditListenerTest.java: 以真实 PostgreSQL/Spring 事务验证角色/状态脱敏投影、严格 BEFORE_COMMIT、共同提交与审计失败共同回滚。
T19AuditApiContractTest.java: 以 MockMvc/JSON Schema 验证审计查询、requestId 关联、筛选绑定 cursor、稳定错误、权限码和敏感列隔离。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
