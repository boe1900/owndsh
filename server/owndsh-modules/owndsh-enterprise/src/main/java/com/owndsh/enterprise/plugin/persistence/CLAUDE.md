# plugin/persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginStore.java: catalog、version CAS、assignment 优先级、主体存在性和 inventory replace 的持久化端口。
JdbcPluginStore.java: V34 安装配置的 PostgreSQL adapter，同包登记使用事务 advisory lock；USER→DEPT→ALL 裁决后过滤退休版本。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
