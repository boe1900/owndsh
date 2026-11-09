# skill/persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

SkillStore.java: release catalog 状态与已发布目录查询的持久化端口。
SkillSourceCredentialStore.java: 仓库访问凭据列表、密文写入和 revision 状态 CAS 端口；保留旧来源列以兼容历史数据。
JdbcSkillSourceCredentialStore.java: PostgreSQL 凭据密文与脱敏元数据 adapter，读写历史 host/project/expiry 列。
JdbcSkillStore.java: V39/V40+ PostgreSQL adapter，所有查询绑定 tenant 并过滤无效 release；发布换 current 指针时先降级同 skill 旧 current、再 CAS 晋升目标，两步同事务——uq_ent_skill_current_release 是立即按行校验的部分唯一索引，单条 UPDATE 同时晋升/降级会因堆扫描顺序间歇撞索引。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
