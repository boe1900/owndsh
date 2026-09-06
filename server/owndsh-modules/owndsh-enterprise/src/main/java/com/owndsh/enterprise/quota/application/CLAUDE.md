# quota/application/

> L2 | 父级: ../CLAUDE.md

成员清单

QuotaMutationContext.java: 管理策略写入的可信 tenant/actor/request 审计上下文。
QuotaPolicySpec.java: TOKEN/RATE 字段互斥与 ORGANIZATION/MEMBER 主体、ALL_MODELS/MODEL_SET/MODEL 及组织级 PROVIDER RATE 资源不变量 command。
QuotaPolicyChangeMetadata.java: QUOTA_CHANGED 审计白名单字段。
QuotaResourceNotFoundException.java: 配额资源不存在稳定领域异常。
QuotaPolicyService.java: 策略 CRUD/状态 CAS、subject 校验、revision 与审计事务编排。
EffectiveQuotaResolver.java: ORGANIZATION/MEMBER 主体与可选模型资源 ACTIVE 策略按 ID 排序叠加解析器。
QuotaWindowCalculator.java: 策略锚点连续 5 小时与冻结部署时区自然日/周/月 start/reset 计算器。
QuotaTokenEstimator.java: 可见 system/messages/tools UTF-8 字节除三向上取整并叠加输出预留。
QuotaRateLimiter.java: 全部适用 policy 的 Redis RPM/并发原子 lease 端口。
QuotaExceededException.java: 5 小时/日/周/月/RPM/并发 429 稳定错误与 policy/reset 事实。
QuotaRejectionMetadata.java: QUOTA_REJECTED 审计的类别、policy 和估算量白名单。
ReservationRecoveredMetadata.java: 恢复审计白名单；SENT 有最终 usage 快照时 SETTLED，否则 CHARGED_MAX。
RequestInProgressException.java: 幂等键命中非终态 reservation 的 409 领域异常。
RequestAlreadyCompletedException.java: 幂等键命中终态 reservation 的 409 领域异常。
QuotaReservationCommand.java: T10 到预留服务的可信请求/资源/估算 command。
UsageTokens.java: 上游 usage 的 input/output/cache 非负分类值。
QuotaReservationService.java: PostgreSQL 预留与 Redis lease 编排；发送意图先落库，usage 在独立事务保存，实测量与扣额分离，兜底与恢复统一优先使用快照且 Redis 清理不回滚账本。
QuotaUsageQueryService.java: 按策略类型读取四类窗口或 RPM/并发快照，并组合本人有效策略和管理员 ledger 查询。
QuotaRecoveryJob.java: 每分钟领取过期 reservation，按是否发送及是否已有 usage 快照恢复为 RELEASED/SETTLED/CHARGED_MAX。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
