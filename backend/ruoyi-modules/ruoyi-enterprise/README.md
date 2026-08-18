# ruoyi-enterprise

企业治理后端领域模块。T03 提供 PostgreSQL Flyway `V1` 至 `V5`、用途隔离 AES-256-GCM、
bootstrap revision CAS 和只追加审计事务基础设施；T04 在同一模块内增加 OIDC、LDAP、LOCAL
身份适配器、稳定 external identity、显式组映射和身份管理 API；T05 增加固定 public client 的
Authorization Code + PKCE、Sa-Token 终端隔离、公开登录页与设备生命周期；T08 增加
provider/model/grant 管理、provider 密钥保护、有效默认解析和 runtime bootstrap 模型目录；T09
增加 Flyway `V6`、叠加配额、PostgreSQL reservation、Redis lease、结算恢复和用量 API。

## 身份边界

- OIDC 使用 Nimbus 完成 Discovery、Authorization Code + PKCE、声明算法/JWKS、issuer、
  audience 和 nonce 校验；原始 Token 与未映射 claims 不离开 adapter。
- LDAP 使用 manager search + user bind，要求 LDAPS 或 StartTLS 二选一，过滤值按 RFC 4515
  转义，并要求显式稳定属性（如 entryUUID），不回退到可变用户名。
- LOCAL 复用 RuoYi BCrypt、Redis 失败计数和锁定策略，以 userId 为稳定 subject。
- 外部身份只按 source + issuer + subject 解析；不会按 username/email 自动合并，也不会自动
  分配角色。多组映射到不同部门时不覆盖已有部门。

管理端点位于 `/enterprise/admin/v1/identity-sources` 和
`/enterprise/admin/v1/group-mappings`，使用 `ent:identity:read/write`、统一
`data/requestId` envelope、revision CAS 和最大 200 条的 keyset cursor 分页。cursor 使用
master key 的独立 `API_CURSOR` 用途进行 AES-GCM 认证，并绑定 tenant 与筛选条件。响应只暴露
`secretConfigured`，不返回秘密或密文。

部署必须通过 `enterprise.crypto.master-key-file` 指向精确 32 字节文件。开发期只有显式设置
`enterprise.auth.allow-insecure-oidc=true` 才允许 HTTP OIDC；生产保持默认 false。

## 平台登录与设备边界

- `dsh-desktop` 只接受 `http://127.0.0.1:<1024-65535>/callback` 和 UUID v4 installation；
  `enterprise-admin` 只接受配置的精确 HTTPS redirect，两个 client 的参数和 Token 不能混用。
- Redis 登录事务 TTL 为 5 分钟，授权码 TTL 为 60 秒；code 使用 Redis `GETDEL` 先消费再校验，
  redirect/client/installation/verifier 任一不匹配都不能恢复或重放。
- Sa-Token 会话绝对有效期 12 小时且 `is-share=false`。Harness terminal 使用
  `deviceType=harness, deviceId=installationId`，管理端使用独立 `admin-web` terminal。
- Runtime 设备授权只读取服务端 Sa-Token terminal，不信任 `X-Device-Id`。撤销设备更新数据库和
  审计同一事务，随后只注销该 installation 的 Harness Token；其他设备保持有效。

认证入口为 `/enterprise/auth/v1`，设备 Runtime 入口为 `/enterprise/api/v1/devices`，管理入口为
`/enterprise/admin/v1/devices`。设备管理读取与撤销分别要求 `ent:device:read/revoke`。

## 受管模型与 bootstrap 边界

- provider 创建时 credential 必填，只以 `PROVIDER_SECRET` 用途的 AES-256-GCM 密文保存；读取接口
  仅返回 `credentialConfigured`。更新必须显式给出 `replaceSecret`，未替换时保持原密文。
- provider test 使用草稿 base URL、timeout 和可选新 credential 请求 `/models`，不跟随重定向、
  不读取正文，只返回成功、延迟和稳定上游状态类别。
- 模型、provider、grant 都为 `ACTIVE` 才能进入员工目录。USER 与当前 DEPT 授权取并集，默认优先级
  为 USER、DEPT、`sortOrder` fallback，客户端看不到 provider route 或上游模型名。
- RuoYi `sys_user/sys_dept` 使用固定部署的全局主键；tenant 约束施加在 `ent_model_*` 企业事实链上。
  本模块不声称支持详细设计明确排除的 SaaS 多租户。
- `/enterprise/api/v1/bootstrap` 每次重新验证 `dsh-desktop` Token 对应的 ACTIVE 设备与当前用户，
  当前填充有效模型与全部适用配额；插件和 Session policy 保持未启用外壳，留给后续任务。

模型管理入口为 `/enterprise/admin/v1/providers`、`/enterprise/admin/v1/models` 和
`/enterprise/admin/v1/model-grants`，分别使用冻结的 `ent:model:*` 与 `ent:grant:*` 权限码。
创建请求要求 UUID v4 `Idempotency-Key`，更新和状态动作要求 revision `If-Match`；模型与授权删除
达到目标状态后可安全重放。

## 配额与用量边界

- 生效策略是所有 ACTIVE DEFAULT、当前 DEPT 和 USER 策略的并集，不做覆盖合并；所有上限独立
  叠加，并在应用层强制按 policy ID 排序。
- 自然日/月以 `ENT_DEPLOYMENT_TIME_ZONE` 计算。首次启动把 IANA Zone ID 写入
  `ent_quota_runtime_config`，后续配置漂移会拒绝启动，不能通过重启改变累计边界。
- Token 预留在 PostgreSQL 短事务内锁定全部窗口并写 reservation；所有预留、结算、释放和恢复
  统一按 policy/type 加锁。50 并发由数据库约束和行锁防超卖，不依赖 JVM 本地锁。
- RPM 与并发使用单个 Redis Lua 对全部适用策略全成全败；并发 lease 为 120 秒，可续租、显式
  释放并由 TTL 回收。Redis 获取失败会释放数据库预留。
- reservation 固化 requestId 与窗口快照，状态只允许 RESERVED、SENT、RELEASED、SETTLED、
  CHARGED_MAX。过期 RESERVED 释放，过期 SENT 按估算上限计费，恢复使用 `SKIP LOCKED`。
- 管理配额与 ledger 分别位于 `/enterprise/admin/v1/quotas`、`/enterprise/admin/v1/usage`；ACTIVE
  `dsh-desktop` owner 通过 `/enterprise/api/v1/usage/me` 查询本人实时计数。ledger 不包含 prompt、
  messages、provider route 或 credential。

## 数据库

本模块只支持 PostgreSQL。Flyway migration 位于 `src/main/resources/db/migration`，假定 RuoYi
PostgreSQL 基线已经存在，并为企业表创建显式外键、检查约束和索引。`V4` 向 `sys_role` 增加
真实的 `built_in` 列并写入固定角色和权限集合；`V5` 为默认 tenant `000000` 写入 LOCAL 身份源、
默认配额策略和 `BOOTSTRAP` revision；`V6` 冻结部署时区并给 reservation 增加可恢复 requestId。

## 测试

测试需要可用的 Docker daemon，并使用本机或自动拉取的 `postgres:17-alpine`、
`redis:8-alpine` 和 `osixia/openldap:1.5.0` 镜像：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false test
```

测试从真实 RuoYi PostgreSQL 基线启动数据库，分别验证一次性迁移和逐版本升级；不会使用 H2
模拟 PostgreSQL 约束。身份/设备测试还会启动 WireMock OIDC、OpenLDAP StartTLS、Redis 8 和
PostgreSQL 17 Testcontainers，并使用 OpenAPI 派生 JSON Schema 验证认证、设备、模型、配额、
bootstrap 与用量接口的成功/失败响应。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
