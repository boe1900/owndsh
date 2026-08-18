# quota/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseQuotaProperties.java: T09 部署时区配置边界，只接受由环境映射的 IANA Zone ID。
EnterpriseQuotaConfiguration.java: 配额纵向模块 composition root，装配 PostgreSQL、Redis、事务、bootstrap 与恢复任务。
domain/: quota policy/window、reservation 状态机和 prompt-free ledger 领域事实；局部地图见 domain/CLAUDE.md。
application/: 策略治理、有效规则、预留/结算/恢复和用量查询用例；局部地图见 application/CLAUDE.md。
persistence/: V1/V6 配额表与 Redis Lua lease 的 adapters；局部地图见 persistence/CLAUDE.md。
web/: 管理策略/ledger 与 ACTIVE 设备本人用量 HTTP 边界；局部地图见 web/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
