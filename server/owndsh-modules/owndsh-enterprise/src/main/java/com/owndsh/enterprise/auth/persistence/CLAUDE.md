# persistence/

> L2 | 父级: ../CLAUDE.md

成员清单

AuthorizationCodeStore.java: 60 秒授权码创建、GETDEL 原子消费与取消端口。
ExternalGroupMappingStore.java: 组映射 keyset/CAS、批量外部组解析与身份源成员关系整体同步端口。
ExternalIdentityStore.java: stable subject/source-user 绑定读写与 tenant/user 脱敏摘要查询端口。
IdentitySourceStore.java: 身份源 keyset、查找、插入、更新、状态 CAS 与最近连接测试结果端口。
JdbcExternalGroupMappingStore.java: PostgreSQL keyset 列表、CAS 删除、用户组存在性、数组批量解析与来源成员同步 adapter。
JdbcExternalIdentityStore.java: 只持久化白名单 groups JSONB，并通过身份源 join 提供 tenant/user 脱敏摘要的 JDBC adapter。
JdbcIdentitySourceStore.java: 持久化 provisioning mode、JSONB 非秘密配置、独立 bytea/nonce/version 秘密列与固定诊断码的 JDBC adapter。
JdbcPlatformUserStore.java: 只创建 JIT 允许字段、检查成员活动状态且从不写角色/部门的 Host sys_user adapter。
JdbcRefreshSessionStore.java: 以 SHA-256 摘要、PostgreSQL 行锁和局部唯一索引实现 Refresh Session 签发、轮换与批量吊销。
LoginTransactionStore.java: 5 分钟登录或身份绑定事务 create/find/原子消费/删除端口。
OidcLoginStateStore.java: OIDC state 与平台授权码分区的一次性状态端口。
PasswordChangeChallengeStore.java: LOCAL 首次改密 challenge 的唯一创建与 GETDEL 原子消费端口。
PlatformUserStore.java: 外部身份解析/绑定所需的存在性、活动状态和 JIT 成员创建最小端口。
RedisAuthStateStore.java: Redisson StringCodec/Jackson adapter，保真序列化普通登录/成员绑定事务并以 SET NX/GETDEL 保证 TTL 和唯一消费。
RefreshSessionStore.java: Refresh Session 摘要锁定、初始签发、轮换及 family/installation/user 吊销端口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
