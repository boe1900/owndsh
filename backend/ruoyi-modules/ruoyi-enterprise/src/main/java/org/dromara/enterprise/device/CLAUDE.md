# device/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseDeviceConfiguration.java: 设备纵向模块 composition root，装配 PostgreSQL store、事务、审计、Sa-Token 撤销端口与 ID generator。
application/: enroll、heartbeat、ACTIVE 裁决和管理员 list/get/revoke 用例；局部地图见 application/CLAUDE.md。
domain/: 设备状态与 owner/installation/revision 聚合事实；局部地图见 domain/CLAUDE.md。
persistence/: tenant/owner 限定的设备查询和 PostgreSQL 状态变更；局部地图见 persistence/CLAUDE.md。
web/: Runtime 与管理设备协议、可信 Token session 上下文及权限入口；局部地图见 web/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
