# quota/application/

> L2 | 父级: ../CLAUDE.md

成员清单

QuotaMutationContext.java: 管理策略写入的可信 tenant/actor/request 审计上下文。
QuotaPolicySpec.java: nullable 独立限额与 ORGANIZATION/MEMBER 主体不变量 command。
QuotaPolicyChangeMetadata.java: QUOTA_CHANGED 审计白名单字段。
QuotaResourceNotFoundException.java: 配额资源不存在稳定领域异常。
QuotaPolicyService.java: 策略 CRUD/状态 CAS、subject 校验、revision 与审计事务编排。
EffectiveQuotaResolver.java: ORGANIZATION 与当前 MEMBER ACTIVE 策略按 ID 排序叠加解析器。
QuotaWindowCalculator.java: 冻结部署时区的自然日/月 start/reset 计算器。
QuotaTokenEstimator.java: 可见 system/messages/tools UTF-8 字节除三向上取整并叠加输出预留。
QuotaRateLimiter.java: 全部适用 policy 的 Redis RPM/并发原子 lease 端口。
QuotaExceededException.java: 日/月/RPM/并发 429 稳定错误与 policy/reset 事实。
QuotaRejectionMetadata.java: QUOTA_REJECTED 审计的类别、policy 和估算量白名单。
ReservationRecoveredMetadata.java: RESERVATION_RECOVERED 审计的原状态与恢复终态白名单。
RequestInProgressException.java: 幂等键命中非终态 reservation 的 409 领域异常。
RequestAlreadyCompletedException.java: 幂等键命中终态 reservation 的 409 领域异常。
QuotaReservationCommand.java: T10 到预留服务的可信请求/资源/估算 command。
UsageTokens.java: 上游 usage 的 input/output/cache 非负分类值。
QuotaReservationService.java: 按 policy/type 统一锁序执行 PostgreSQL 预留、Redis lease、SENT、结算、释放、续租和恢复状态机。
QuotaUsageQueryService.java: 组织/成员当前窗口、RPM/并发、本人有效策略和管理员 ledger 聚合查询。
QuotaRecoveryJob.java: 每分钟领取过期 reservation 并执行 RELEASED/CHARGED_MAX 恢复。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
