# model/persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

ProviderStore.java: provider keyset/find/insert/update/status CAS 持久化端口。
JdbcProviderStore.java: V13 ent_model_provider JDBC adapter，持久化 providerKey/type/protocol，密文只映射独立 bytea/nonce/version 列。
ManagedModelStore.java: 模型 keyset/find/insert/update/status/delete CAS 持久化端口。
ManagedModelDeleteBlockers.java: 模型删除前的授权、模型集、配额和用量引用计数事实。
ModelSetDeleteBlockers.java: 模型集删除前的模型授权和配额策略引用计数事实。
JdbcManagedModelStore.java: V15 ent_managed_model 与 provider 名称 join 的 PostgreSQL adapter，使用 JSONB 往返 reasoningEfforts/compat 三态，并在删除事务内统计阻塞引用。
ModelGrantStore.java: 授权 CRUD、主体/资源存在性和 ACTIVE 有效候选查询端口。
JdbcModelGrantStore.java: ent_model_grant JDBC adapter，按三类主体和模型/模型集合并 ACTIVE 候选并携带 provider API 协议与 reasoning JSONB。
BootstrapUserStore.java: 当前用户 ACTIVE Host 事实查询端口。
JdbcBootstrapUserStore.java: 固定部署内 sys_user 状态/删除标记约束的 bootstrap 查询 adapter。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
