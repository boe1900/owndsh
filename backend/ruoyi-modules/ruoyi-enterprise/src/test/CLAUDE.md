# test/

> L2 | 父级: ../CLAUDE.md

成员清单

java/org/dromara/enterprise/crypto/SecretCipherTest.java: 验证三用途 AES-GCM round trip、随机 nonce、AAD/用途隔离、篡改认证与防御性复制。
java/org/dromara/enterprise/database/EnterpriseMigrationTest.java: 从真实 RuoYi PostgreSQL 基线验证 V1-V5 一次迁移、逐版本升级与 Boot 4 自动迁移装配。
java/org/dromara/enterprise/database/RbacSeedTest.java: 验证五个 built-in 角色、14 个冻结权限码、最小权限集合与数据库不可变 trigger。
java/org/dromara/enterprise/revision/RevisionAuditIntegrationTest.java: 验证 BOOTSTRAP CAS、稳定冲突码、显式 metadata、只追加审计及同事务回滚。
java/org/dromara/enterprise/test/PostgresTestDatabase.java: 共享 PostgreSQL 17 Testcontainer，为每组验收创建独立数据库并加载上游真实基线。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
