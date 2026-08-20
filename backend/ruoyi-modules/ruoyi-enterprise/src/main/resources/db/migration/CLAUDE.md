# db/migration/

> L2 | 父级: ../../../../../CLAUDE.md

成员清单

V1__enterprise_core.sql: 建立身份、设备、模型、配额、插件和 Session 核心企业事实表及约束。
V2__enterprise_plugin.sql: 建立插件制品、版本、分配和设备状态持久化结构。
V3__enterprise_session.sql: 建立远端 Session replica/event/batch、密文字段和保留状态结构。
V4__enterprise_audit.sql: 建立只追加审计、固定 built-in 角色、菜单、权限码与不可变触发器。
V5__enterprise_seed.sql: 为默认 tenant 写入 LOCAL 身份源、DEFAULT 配额策略和 BOOTSTRAP revision。
V6__enterprise_quota_runtime.sql: 冻结部署 IANA 时区，并给 reservation 增加崩溃恢复所需 requestId。
V7__enterprise_admin_observability.sql: 持久化身份源最近连接测试与设备 heartbeat 的插件/同步脱敏摘要，供 T12 管理投影读取。
V8__enterprise_plugin_server.sql: 把历史 ACTIVE/DISABLED assignment 前向迁移为 INSTALLED/ABSENT，并冻结 T13 客户端调和库存状态约束。
V9__enterprise_session_format.sql: 前向修正官方 rc.7 Session format v0 约束，并补齐 hash 长度与 retention 扫描索引。
V10__enterprise_audit_query.sql: 为 tenant 隔离的 audit cursor 查询与有界 retention 清理补齐复合索引。
V11__enterprise_heartbeat_audit_throttle.sql: 持久化设备最近 heartbeat 审计时间，供数据库行锁内原子执行一小时成功审计限频。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
