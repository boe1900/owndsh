# persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteDeviceStore.java: 管理/本人设备查询、安装身份与公钥 pin 端口，避免公开设备 DTO 携带密钥字段。
JdbcRemoteDeviceStore.java: PostgreSQL owner/installation 查询与在线快照，条件 UPSERT 原子建立首次 Host key，拒绝后续静默换钥。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
