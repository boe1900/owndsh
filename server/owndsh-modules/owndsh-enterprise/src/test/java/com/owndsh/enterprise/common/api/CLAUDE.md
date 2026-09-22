# common/api/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

EnterpriseCursorCodecTest.java: 验证时间精度与 ID 格式兼容，拒绝跨租户、筛选、格式和篡改的游标。
EnterpriseJsonBodyLimitFilterTest.java: 绕过 Content-Length 的 chunked JSON、精确上限、稳定 413 与专用 gateway 边界回归。
T20FaultBoundaryTest.java: 数据库/Redis 不可达故障的 retryable 503 投影和日志秘密隔离回归。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
