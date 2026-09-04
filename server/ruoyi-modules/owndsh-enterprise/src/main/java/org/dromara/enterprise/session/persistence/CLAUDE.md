# persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

SessionStore.java: replica 行锁、批次幂等、加密事件、keyset 列表和 tombstone 的持久化端口。
JdbcSessionStore.java: V3/V9 三表的 PostgreSQL 实现，所有资源查询同时限定 tenant 与 owner 或 replica ID。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
