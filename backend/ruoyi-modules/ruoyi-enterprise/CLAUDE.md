# ruoyi-enterprise/

> L2 | 父级: ../../CLAUDE.md

成员清单

pom.xml: 企业治理 Maven 边界，运行时依赖 Spring JDBC/Redis、Jackson、Flyway/PostgreSQL，测试使用真实 PostgreSQL/Redis/OpenLDAP Testcontainers。
README.md: 模块职责、身份/PKCE/设备边界、部署前置条件和可重复测试入口。
src/main/java/org/dromara/enterprise/auth/: OIDC/LDAP/LOCAL、外部身份、PKCE 登录事务与固定 public client 会话纵向模块；局部地图见 auth/CLAUDE.md。
src/main/java/org/dromara/enterprise/device/: Token terminal 授权的 enroll/heartbeat/ACTIVE/revoke 设备纵向模块；局部地图见 device/CLAUDE.md。
src/main/java/org/dromara/enterprise/common/: 企业 HTTP envelope、36 个稳定错误映射、requestId/metadata 与认证 cursor 公共边界；局部地图见 common/CLAUDE.md。
src/main/java/org/dromara/enterprise/audit/: 只追加审计领域契约与 JDBC sink，metadata 只能通过显式 marker DTO 进入 JSONB。
src/main/java/org/dromara/enterprise/crypto/: HKDF-SHA-256 用途派生与 AES-256-GCM 秘密/cursor 保护，不暴露 master key 或派生 key。
src/main/java/org/dromara/enterprise/revision/: 固定 BOOTSTRAP scope 的 optimistic CAS、稳定冲突错误码与审计同事务编排。
src/main/resources/db/migration/: PostgreSQL `V1` 至 `V5` 真源，依次建立核心、插件、Session、审计/RBAC 与默认 seed。
src/main/resources/static/enterprise/auth/: 无 Token 的公开身份源选择、密码与 OIDC 跳转页；局部地图见 auth/CLAUDE.md。
src/test/java/org/dromara/enterprise/: 单元和 Testcontainers 集成验收，覆盖数据库、身份、PKCE/Redis、设备、协议和事务边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
