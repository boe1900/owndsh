# quota/

> L2 | 父级: ../../../../../CLAUDE.md

成员清单

QuotaManagementIntegrationTest.java: PostgreSQL 真实策略、预留、结算和时间/ID 倒序续页门禁，覆盖同时间记录、逆序 ID 与租户隔离。
T09ApiContractTest.java: MockMvc 与生成 Schema 验证配额/用量接口、认证 cursor 和稳定业务错误。
QuotaWindowCalculatorTest.java: 固定时钟验证自然日/周/月及连续 5 小时窗口边界。
RedisQuotaRateLimiterTest.java: 真实 Redis 验证叠加限流、租约与释放行为。
application/QuotaOrderingTest.java: 验证预留持久化与发送/结算意图的调用顺序。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
