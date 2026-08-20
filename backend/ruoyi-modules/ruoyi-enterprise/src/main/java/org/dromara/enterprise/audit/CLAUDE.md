# audit/

> L2 | 父级: ../../../../CLAUDE.md

成员清单

AuditAction.java: 详细设计第 13 节 30 个 action 的枚举真源，与 PostgreSQL check 约束保持同构。
AuditActorType.java: USER/SYSTEM actor 分类。
AuditResult.java: SUCCESS/FAILURE 结果分类。
AuditMetadata.java: 每个显式 metadata DTO 必须声明唯一 action 的编译期入口闸门。
AuditEvent.java: 写入账本前校验 actor、关联字段及 action/metadata 同构的只追加事件。
AuditSink.java: 业务事务唯一 append 端口，不暴露修改或删除能力。
JdbcAuditSink.java: 只执行 INSERT 并序列化显式 DTO 的 PostgreSQL adapter。
EmptyAuditMetadata.java: DEVICE_REVOKED 的显式空 metadata。
RevisionChangedMetadata.java: CONFIG_CHANGED 的 revision 白名单。
AuditEventRecord.java: 不含原始 user-agent 的只读账本投影。
AuditFilter.java: action/actor/resource/result/reason/requestId/时间筛选值对象。
AuditQueryStore.java: 审计 keyset 查询和 retention 批量删除端口。
JdbcAuditQueryStore.java: 参数化筛选、metadata JSON 读取与按截止时间批量清理 adapter。
AuditQueryService.java: 管理查询和保留清理应用边界。
AuditRetentionJob.java: 每日按固定 tenant 分批删除超过保留期的审计。
EnterpriseAuditProperties.java: audit 365 天保留期与批量配置。
EnterpriseAuditConfiguration.java: 查询 store/service 和 retention job 组合根。
AdminAuditController.java: `ent:audit:read` 保护的 cursor 查询入口，cursor AAD 绑定全部筛选条件。
AuditEventView.java: 管理 API 的 ID 字符串化和白名单 metadata 响应投影。
UserGovernanceAuditMetadata.java: ROLE_ASSIGNED/USER_STATUS_CHANGED 的脱敏 metadata DTO。
UserGovernanceAuditListener.java: 在 RuoYi 用户事务提交前把治理事件追加到同一企业审计账本。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
