# skill/persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

SkillStore.java: release catalog 状态与已发布目录查询的持久化端口。
SkillSourceCredentialStore.java: 仓库访问凭据列表、密文写入和 revision 状态 CAS 端口。
JdbcSkillSourceCredentialStore.java: PostgreSQL 凭据密文与脱敏元数据 adapter。
JdbcSkillStore.java: V39/V40+ PostgreSQL adapter，所有查询绑定 tenant 并过滤无效 release。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
