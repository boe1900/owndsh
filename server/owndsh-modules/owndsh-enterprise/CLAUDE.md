# owndsh-enterprise/

> L2 | 父级: ../../CLAUDE.md

成员清单

pom.xml: 企业治理 Maven 边界，运行时依赖 Spring JDBC/Redis、Jackson、Flyway/PostgreSQL、Commons Compress 与 RFC 8785 JCS，测试使用真实 PostgreSQL/Redis/OpenLDAP Testcontainers。
README.md: 模块职责、身份/PKCE/设备/模型/配额/插件边界、部署前置条件和可重复测试入口。
src/main/java/com/owndsh/enterprise/auth/: OIDC/LDAP/LOCAL、LDAP 目录按需发现/导入、扁平产品用户组、PKCE 与固定 public client Access/Refresh Session 纵向模块；局部地图见 auth/CLAUDE.md。
src/main/java/com/owndsh/enterprise/device/: Token terminal 授权的 enroll/heartbeat/ACTIVE/revoke 设备纵向模块；局部地图见 device/CLAUDE.md。
src/main/java/com/owndsh/enterprise/model/: provider/model/model set/grant 管理、AES-GCM 密钥生命周期、集合授权展开、有效默认解析、runtime bootstrap 与模型网关纵向模块；局部地图见 model/CLAUDE.md。
src/main/java/com/owndsh/enterprise/quota/: TOKEN/RATE 互斥的组织/成员与多模型范围策略、组织级供应商速率上限、四类 Token 窗口、PostgreSQL 预留、Redis lease、结算恢复与用量查询纵向模块；局部地图见 quota/CLAUDE.md。
src/main/java/com/owndsh/enterprise/plugin/: tgz 流式验包、JCS/Ed25519、CAS 制品、version/assignment、下载授权与设备库存纵向模块；局部地图见 plugin/CLAUDE.md。
src/main/java/com/owndsh/enterprise/session/: 精确 JSONL/hash、AES-GCM 远端副本、本人/管理读取、tombstone 与 retention 纵向模块；局部地图见 session/CLAUDE.md。
src/main/java/com/owndsh/enterprise/common/: 企业 HTTP envelope、40 个稳定错误映射、requestId/metadata、认证 cursor、有界 JSON 请求与故障日志隔离公共边界；局部地图见 common/CLAUDE.md。
src/main/java/com/owndsh/enterprise/audit/: 31-action 显式 metadata DTO、只追加 JDBC sink、tenant/keyset 管理查询、365 天有界 retention 与用户治理事务监听纵向模块；局部地图见 audit/CLAUDE.md。
src/main/java/com/owndsh/enterprise/deployment/: deploy profile 一次性管理员、PostgreSQL 锁和初始化完成标记边界；局部地图见 deployment/CLAUDE.md。
src/main/java/com/owndsh/enterprise/crypto/: HKDF-SHA-256 用途派生与 AES-256-GCM 秘密/cursor 保护，不暴露 master key 或派生 key。
src/main/java/com/owndsh/enterprise/revision/: 固定 BOOTSTRAP scope 的 optimistic CAS、稳定冲突错误码与审计同事务编排。
src/main/resources/db/migration/: PostgreSQL `V1` 至 `V28` 真源，建立企业事实、审计/RBAC、Harness 模型配置、成员治理、策略与 Refresh Session；局部地图见 db/migration/CLAUDE.md。
src/main/resources/static/enterprise/auth/: 无 Token 的公开身份源选择、LOCAL 首次改密/验证码、LDAP 密码与 OIDC 跳转页；局部地图见 auth/CLAUDE.md。
src/test/java/com/owndsh/enterprise/: 单元和 Testcontainers 集成验收，覆盖数据库、身份、PKCE/Redis、Refresh Token 轮换/重放、设备、模型、配额、插件、协议和事务边界；局部地图见 src/test/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
