# audit/

> L2 | 父级: ../../CLAUDE.md

成员清单

AuditMetadataPolicyTest.java: 构造全部 30 个 action 的真实 metadata DTO，验证覆盖全集、JSON 不泄露 action 字段和错配拒绝。
AuditIntegrationTest.java: 以真实 PostgreSQL 验证 requestId 关联查询、筛选、白名单 JSON 与 365 天批量 retention。
UserGovernanceAuditListenerTest.java: 以真实 PostgreSQL/Spring 事务验证角色/状态脱敏投影、严格 BEFORE_COMMIT、共同提交与审计失败共同回滚。
T19AuditApiContractTest.java: 以 MockMvc/JSON Schema 验证审计查询、requestId 关联、筛选绑定 cursor、稳定错误、权限码和敏感列隔离。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
