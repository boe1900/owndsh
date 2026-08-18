# persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

AuthorizationCodeStore.java: 60 秒授权码创建、GETDEL 原子消费与取消端口。
ExternalGroupMappingStore.java: 组映射 keyset/CAS 与批量 group-to-department 解析端口。
ExternalIdentityStore.java: stable subject 和 source-user 唯一绑定查询/写入端口。
IdentitySourceStore.java: 身份源 keyset、查找、插入、更新与状态 CAS 端口。
JdbcExternalGroupMappingStore.java: PostgreSQL keyset 列表、CAS 删除、部门存在性和数组批量解析 adapter。
JdbcExternalIdentityStore.java: 只持久化白名单 groups JSONB 的外部身份 JDBC adapter。
JdbcIdentitySourceStore.java: 把非秘密配置写入 JSONB、秘密写入 bytea/nonce/version 独立列的 JDBC adapter。
JdbcPlatformUserStore.java: 只创建/同步允许字段且从不写角色的 RuoYi sys_user adapter。
LoginTransactionStore.java: 5 分钟登录事务 create/find/原子消费/删除端口。
OidcLoginStateStore.java: OIDC state 与平台授权码分区的一次性状态端口。
PlatformUserStore.java: 外部身份绑定所需的平台用户最小端口。
RedisAuthStateStore.java: Redisson StringCodec/Jackson adapter，使用 set-if-absent 与 Redis GETDEL 保证 TTL 和唯一消费。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
