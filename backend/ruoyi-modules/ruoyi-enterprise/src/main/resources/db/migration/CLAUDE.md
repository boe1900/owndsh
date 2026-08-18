# db/migration/

> L2 | 父级: ../../../../../CLAUDE.md

成员清单

V1__enterprise_core.sql: 建立身份、设备、模型、配额、插件和 Session 核心企业事实表及约束。
V2__enterprise_plugin.sql: 建立插件制品、版本、分配和设备状态持久化结构。
V3__enterprise_session.sql: 建立远端 Session replica/event/batch、密文字段和保留状态结构。
V4__enterprise_audit.sql: 建立只追加审计、固定 built-in 角色、菜单、权限码与不可变触发器。
V5__enterprise_seed.sql: 为默认 tenant 写入 LOCAL 身份源、DEFAULT 配额策略和 BOOTSTRAP revision。
V6__enterprise_quota_runtime.sql: 冻结部署 IANA 时区，并给 reservation 增加崩溃恢复所需 requestId。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
