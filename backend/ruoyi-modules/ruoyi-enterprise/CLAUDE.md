# ruoyi-enterprise/

> L2 | 父级: ../../CLAUDE.md

成员清单

pom.xml: 企业治理 Maven 边界，运行时依赖 Spring JDBC、Jackson、Boot Flyway starter/PostgreSQL，测试使用真实 PostgreSQL Testcontainers。
README.md: 模块职责、数据库前置条件和可重复测试入口。
src/main/java/org/dromara/enterprise/audit/: 只追加审计领域契约与 JDBC sink，metadata 只能通过显式 marker DTO 进入 JSONB。
src/main/java/org/dromara/enterprise/crypto/: HKDF-SHA-256 用途派生与 AES-256-GCM 密钥保护，不暴露 master key 或派生 key。
src/main/java/org/dromara/enterprise/revision/: 固定 BOOTSTRAP scope 的 optimistic CAS、稳定冲突错误码与审计同事务编排。
src/main/resources/db/migration/: PostgreSQL `V1` 至 `V5` 真源，依次建立核心、插件、Session、审计/RBAC 与默认 seed。
src/test/java/org/dromara/enterprise/: 单元和 Testcontainers 集成验收，覆盖 migration、权限 seed、加密、CAS 与事务回滚。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
