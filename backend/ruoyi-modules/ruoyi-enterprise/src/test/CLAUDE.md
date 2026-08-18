# test/

> L2 | 父级: ../CLAUDE.md

成员清单

java/org/dromara/enterprise/crypto/SecretCipherTest.java: 验证全部封闭用途 AES-GCM round trip、随机 nonce、AAD/用途隔离、篡改认证与防御性复制。
java/org/dromara/enterprise/auth/LocalIdentityAdapterTest.java: 验证 RuoYi BCrypt、失败策略复用、稳定 userId subject、停用与不存在账号同形失败。
java/org/dromara/enterprise/auth/OidcIdentityAdapterTest.java: 使用 WireMock、真实 RSA ID Token 和轮换 JWKS 验证 Discovery 声明算法、code+PKCE、issuer/aud/nonce 与 claim 白名单。
java/org/dromara/enterprise/auth/LdapIdentityAdapterTest.java: 使用 StartTLS OpenLDAP 验证 manager search、用户 bind、LDAPS/StartTLS 互斥、RFC 4515 转义和 entryUUID 稳定 subject。
java/org/dromara/enterprise/auth/IdentityPersistenceIntegrationTest.java: 以真实 PostgreSQL 验证身份秘密隔离、keyset、资源 CAS、revision/审计回滚、稳定 subject、显式绑定冲突和多部门映射冲突。
java/org/dromara/enterprise/auth/IdentityAdminApiTest.java: 以 MockMvc 和 OpenAPI 派生 schema 验证 T04 十个管理 operation、认证 cursor、requestId、权限码、revision 错误与秘密输出隔离。
java/org/dromara/enterprise/test/OpenLdapTestServer.java: 共享 OpenLDAP Testcontainer 与测试专用 TLS trust，集中管理 LDAP 集成环境。
java/org/dromara/enterprise/database/EnterpriseMigrationTest.java: 从真实 RuoYi PostgreSQL 基线验证 V1-V5 一次迁移、逐版本升级与 Boot 4 自动迁移装配。
java/org/dromara/enterprise/database/RbacSeedTest.java: 验证五个 built-in 角色、14 个冻结权限码、最小权限集合与数据库不可变 trigger。
java/org/dromara/enterprise/revision/RevisionAuditIntegrationTest.java: 验证 BOOTSTRAP CAS、稳定冲突码、显式 metadata、只追加审计及同事务回滚。
java/org/dromara/enterprise/test/PostgresTestDatabase.java: 共享 PostgreSQL 17 Testcontainer，为每组验收创建独立数据库并加载上游真实基线。
resources/ldap/bootstrap.ldif: OpenLDAP 集成测试的固定组织、用户与可验证属性数据，不含生产秘密。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
