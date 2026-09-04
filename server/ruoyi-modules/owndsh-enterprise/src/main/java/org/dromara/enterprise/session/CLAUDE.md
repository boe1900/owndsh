# session/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseSessionConfiguration.java: Session 服务端 composition root，装配字节解析、JDBC adapter、事务服务和每日 retention job。
EnterpriseSessionProperties.java: 单批明文字节、正文保留天数与每次清理数量的部署边界。
domain/: 远端副本、加密事件与复制批次的不可变领域事实；局部地图见 domain/CLAUDE.md。
application/: 精确 JSONL 校验、滚动 hash、append/read/delete/audit 与 retention 事务编排；局部地图见 application/CLAUDE.md。
persistence/: V3/V9 Session 表的 PostgreSQL adapter 与行锁边界；局部地图见 persistence/CLAUDE.md。
web/: runtime 和管理 Controller、严格请求 DTO 与明文安全投影；局部地图见 web/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
