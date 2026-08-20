# persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

DeviceStore.java: tenant/installation/id keyset 查询与完整 enroll/revoke、带 auditDue 结果的 heartbeat 原子状态变更端口。
JdbcDeviceStore.java: 复用 V1/V7/V11 ent_device 和 sys_user 的 PostgreSQL adapter，行锁内持久化 heartbeat 摘要并按首次、一小时及健康状态切换原子声明 auditDue。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
