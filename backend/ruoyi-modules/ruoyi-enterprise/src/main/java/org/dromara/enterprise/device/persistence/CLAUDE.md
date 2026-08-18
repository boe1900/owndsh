# persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

DeviceStore.java: tenant/installation/id keyset 查询与 enroll/heartbeat/revoke 原子状态变更端口。
JdbcDeviceStore.java: 复用 V1 ent_device 和 sys_user 的 PostgreSQL adapter，以 owner/status/revision 条件防止越权或丢失更新。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
