# plugin/persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginStore.java: catalog、version CAS、指定旧版范围迁移、assignment 优先级、主体存在性和 inventory replace 的持久化端口。
JdbcPluginStore.java: V34 安装配置的 PostgreSQL adapter，同包登记使用事务 advisory lock；升级仅更新同包/旧版的 ACTIVE/INSTALLED 范围及行 revision，保留规则 ID、撤回和其他版本；USER→DEPT→ALL 裁决后过滤退休版本。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
