# plugin/persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginStore.java: catalog、version CAS、assignment 优先级、主体存在性和 inventory replace 的持久化端口。
JdbcPluginStore.java: V2/V8 PostgreSQL adapter，先裁决 USER→DEPT→ALL，再仅返回已发布版本或显式撤回；退休不再允许下载，也不意外回退到更宽范围。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
