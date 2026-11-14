# persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteDeviceStore.java: 管理/本人设备查询、安装身份与公钥 pin 端口；本人查询可排除源安装，Console 不排除；公开 DTO 不携带密钥。
JdbcRemoteDeviceStore.java: PostgreSQL 本人目录在分页前仅选择 ACTIVE，保留离线设备及管理诊断中的撤销历史，以 IS DISTINCT FROM 支持可选源安装；条件 UPSERT 原子建立首次 Host key，拒绝后续静默换钥。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
