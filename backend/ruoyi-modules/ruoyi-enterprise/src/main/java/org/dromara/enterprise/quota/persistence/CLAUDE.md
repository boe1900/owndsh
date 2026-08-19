# quota/persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

QuotaPolicyStore.java: 策略 CRUD/CAS、主体存在性和 DEFAULT+DEPT+USER 生效查询端口。
JdbcQuotaPolicyStore.java: ent_quota_policy 与 RuoYi 用户/部门读投影的 PostgreSQL adapter。
QuotaSubjectStore.java: runtime 当前 ACTIVE RuoYi 用户与部门最小事实查询端口。
JdbcQuotaSubjectStore.java: 固定部署 sys_user 状态/删除标记约束的配额用户 adapter。
QuotaWindowStore.java: 当前窗口创建/锁定、计数调整和读查询端口。
JdbcQuotaWindowStore.java: ent_quota_window ON CONFLICT + FOR UPDATE 防超卖 adapter。
QuotaRuntimeConfigStore.java: tenant 部署时区首次写入与后续一致性验证端口。
JdbcQuotaRuntimeConfigStore.java: V6 不可变时区事实的 PostgreSQL adapter，不暴露修改能力。
UsageReservationStore.java: 幂等 reservation、状态 CAS 与过期 SKIP LOCKED 领取端口。
JdbcUsageReservationStore.java: ent_usage_reservation 严格 JSON 窗口快照 PostgreSQL adapter。
UsageLedgerStore.java: 终态 ledger 唯一插入、语义投影筛选分页与聚合端口。
JdbcUsageLedgerStore.java: prompt-free ent_usage_ledger 写入及用户/部门/模型只读 join 查询 adapter。
RedisQuotaRateLimiter.java: 单 Lua 原子获取全部 policy RPM/并发 lease，并提供续租、释放与实时计数。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
