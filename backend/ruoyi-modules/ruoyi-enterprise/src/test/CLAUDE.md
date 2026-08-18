# test/

> L2 | 父级: ../CLAUDE.md

成员清单

java/org/dromara/enterprise/crypto/SecretCipherTest.java: 验证全部封闭用途 AES-GCM round trip、随机 nonce、AAD/用途隔离、篡改认证与防御性复制。
java/org/dromara/enterprise/auth/LocalIdentityAdapterTest.java: 验证 RuoYi BCrypt、失败策略复用、稳定 userId subject、停用与不存在账号同形失败。
java/org/dromara/enterprise/auth/OidcIdentityAdapterTest.java: 使用 WireMock、真实 RSA ID Token 和轮换 JWKS 验证 Discovery 声明算法、code+PKCE、issuer/aud/nonce 与 claim 白名单。
java/org/dromara/enterprise/auth/LdapIdentityAdapterTest.java: 使用 StartTLS OpenLDAP 验证 manager search、用户 bind、LDAPS/StartTLS 互斥、RFC 4515 转义和 entryUUID 稳定 subject。
java/org/dromara/enterprise/auth/IdentityPersistenceIntegrationTest.java: 以真实 PostgreSQL 验证身份秘密隔离、keyset、资源 CAS、revision/审计回滚、稳定 subject、显式绑定冲突和多部门映射冲突。
java/org/dromara/enterprise/auth/IdentityAdminApiTest.java: 以 MockMvc 和 OpenAPI 派生 schema 验证 T04 十个管理 operation、认证 cursor、requestId、权限码、revision 错误与秘密输出隔离。
java/org/dromara/enterprise/auth/PlatformAuthorizationSecurityTest.java: 使用真实 Redis 验证 S256/redirect/client 参数、code 原子消费、并发交换、取消和失效事务零用户副作用。
java/org/dromara/enterprise/auth/RedisAuthStateStoreIntegrationTest.java: 使用 Redis 8 验证 5 分钟事务、60 秒 code、GETDEL 唯一消费、过期/取消与 OIDC key 分区。
java/org/dromara/enterprise/auth/T05ApiContractTest.java: 以 MockMvc 和派生 JSON Schema 验证七个认证及五个设备 operation 与权限注解。
java/org/dromara/enterprise/device/DeviceContextIsolationTest.java: 证明伪造 X-Device-Id 不会覆盖 Sa-Token terminal 的 installation 授权事实。
java/org/dromara/enterprise/device/DeviceLifecycleIntegrationTest.java: 以真实 PostgreSQL 验证多设备 owner、heartbeat、CAS、审计同事务与单设备撤销隔离。
java/org/dromara/enterprise/model/ProviderProbeTest.java: 使用 WireMock 验证 `/models` Bearer 探测、状态分类、正文隔离与 no-redirect。
java/org/dromara/enterprise/model/EffectiveModelResolverTest.java: 纯单元验证 USER 默认缺失时的 DEPT 默认选择与空候选边界。
java/org/dromara/enterprise/model/T08ApiContractTest.java: 以 MockMvc/JSON Schema 验证模型管理及 bootstrap 全 operation 的成功/失败协议、权限码与密钥不回显。
java/org/dromara/enterprise/model/ModelManagementIntegrationTest.java: 以真实 PostgreSQL 验证密文/CAS/回滚、幂等删除、授权并集、默认优先级、停用与 ACTIVE bootstrap。
java/org/dromara/enterprise/test/OpenLdapTestServer.java: 共享 OpenLDAP Testcontainer 与测试专用 TLS trust，集中管理 LDAP 集成环境。
java/org/dromara/enterprise/test/RedisTestServer.java: 共享 Redis 8 Testcontainer，并为每项认证测试清理隔离 keyspace。
java/org/dromara/enterprise/database/EnterpriseMigrationTest.java: 从真实 RuoYi PostgreSQL 基线验证 V1-V5 一次迁移、逐版本升级与 Boot 4 自动迁移装配。
java/org/dromara/enterprise/database/RbacSeedTest.java: 验证五个 built-in 角色、14 个冻结权限码、最小权限集合与数据库不可变 trigger。
java/org/dromara/enterprise/revision/RevisionAuditIntegrationTest.java: 验证 BOOTSTRAP CAS、稳定冲突码、显式 metadata、只追加审计及同事务回滚。
java/org/dromara/enterprise/test/PostgresTestDatabase.java: 共享 PostgreSQL 17 Testcontainer，为每组验收创建独立数据库并加载上游真实基线。
resources/ldap/bootstrap.ldif: OpenLDAP 集成测试的固定组织、用户与可验证属性数据，不含生产秘密。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
