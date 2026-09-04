# T03 Server 模块与数据库验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T03 已完成，且没有进入 T04。`owndsh-enterprise` 已作为独立 Maven 业务模块接入聚合根和 `owndsh-server`；数据库只支持 PostgreSQL，Flyway `V1` 至 `V5` 在仓库自带的完整 原始服务端框架 PostgreSQL 基线上同时通过一次性迁移和逐版本升级。

本任务建立的是后续纵向能力共享的硬边界：20 张 `ent_` 表、五个固定角色、14 个详细设计冻结权限码、三用途秘密加密、`BOOTSTRAP` revision CAS，以及只暴露 append 的审计端口和同事务编排。没有创建身份适配器、Controller、管理页面、provider CRUD、配额结算、插件分发或 Session 同步实现。

## 数据库与 RBAC

| Migration | 实际内容 |
|---|---|
| `V1__enterprise_core.sql` | 身份源/外部身份/组映射、platform revision、设备、provider/model/grant、quota policy/window、usage reservation/ledger。 |
| `V2__enterprise_plugin.sql` | package/version/assignment/device inventory；复合外键保证 version 属于 assignment 的 package。 |
| `V3__enterprise_session.sql` | replica/event/batch、密文字段成对约束、序列范围、删除 tombstone 状态约束。 |
| `V4__enterprise_audit.sql` | 只追加 audit 表和索引、`sys_role.built_in`、五个固定角色、企业菜单、14 个权限码和不可变 trigger。 |
| `V5__enterprise_seed.sql` | tenant `000000` 的 LOCAL 身份源、默认配额 policy 和 revision 0 的 `BOOTSTRAP` 行。 |

`enterprise_admin` 获得全部企业权限；`model_admin`、`plugin_admin`、`auditor` 只获得详细设计列出的最小集合；`employee` 不依赖角色权限访问本人接口，因此固定角色没有管理权限码。数据库拒绝固定角色改名、软删和权限集合变化，但不阻断 `sys_user_role` 的用户分配。

测试没有使用 H2。共享 Testcontainers 2.0.5 启动 `postgres:17-alpine`，每个测试组创建独立数据库，通过容器内 `psql -v ON_ERROR_STOP=1` 加载 `server/script/sql/postgres/postgres_owndsh.sql`，然后以 Flyway baseline version `0` 执行企业 migration。

## 加密、Revision 与审计

`SecretCipher` 要求 32 字节 master key，使用 RFC 5869 HKDF-SHA-256 empty salt 和三个封闭 purpose info 派生 AES-256 key。每次 AES-GCM 加密生成 12 字节随机 nonce，authentication tag 与 ciphertext 一同存储；AAD 精确绑定 `tenant_id:table:id:field:key_version`，MVP 拒绝 version 1 之外的值。错误消息不包含 key、AAD 或明文。

`JdbcBootstrapRevisionStore` 使用 `UPDATE ... WHERE tenant_id=? AND scope='BOOTSTRAP' AND revision=?` 原子递增；受影响行数为零抛出带 expected/current 的 `RevisionConflictException`，稳定错误码为 `ENT_REVISION_CONFLICT`。

审计 metadata 参数类型必须实现 `AuditMetadata`，当前 revision 事务只序列化 `RevisionChangedMetadata`，不能把 Controller `Map` 直接写入 JSONB。`AuditSink` 只有 `append`；PostgreSQL trigger 拒绝历史 update，保留任务需要的 delete 仍被允许。集成测试在审计 INSERT 后故意抛错，最终 revision 保持 0 且 audit 行数为 0，证明两者使用同一事务回滚。

## 自动验收

环境复核：Git `2.39.5`、Node.js `v24.14.1`、pnpm `11.19.0`、OpenJDK `21.0.12`、Docker Client/Server `28.5.2`。macOS 系统 `java` 仍是未注册的占位 shim，后端命令继续显式使用 `/usr/local/opt/openjdk@21`。

模块门禁实际执行：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false test
```

结果：16 个测试全部通过，其中 migration/Boot 自动装配 3 个、RBAC 3 个、AES-GCM 6 个、revision/审计事务 4 个；Maven reactor 3 个模块全部成功。逐版本测试在同一数据库依次从 V1 升到 V5，没有重建 schema。

全仓回归与边界检查实际执行：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -Dmaven.test.skip=false test

./scripts/bootstrap-harness.sh --check-only
node scripts/upstream-baseline.mjs verify
git diff --check
```

后端全 reactor、上游锁和 whitespace 检查均通过。同级 `deepseek-harness` 保持提交 `47f943859bef60e4160492346772ded9b24f765a` 且工作区干净，T03 没有修改任何 Harness 文件。

## 任务边界

T04 可以在独立后续任务实现 `IdentityAdapter`、OIDC/LDAP/LOCAL 与身份源管理 API。T03 只提供其所需的表、加密和事务基础，不以空 Controller、TODO 或 mock 身份源提前占位。
