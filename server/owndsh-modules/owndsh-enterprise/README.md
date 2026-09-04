# owndsh-enterprise

企业治理后端领域模块。T03 提供 PostgreSQL Flyway `V1` 至 `V5`、用途隔离 AES-256-GCM、
bootstrap revision CAS 和只追加审计事务基础设施；T04 在同一模块内增加 OIDC、LDAP、LOCAL
身份适配器、稳定 external identity、显式组映射和身份管理 API；T05 增加固定 public client 的
Authorization Code + PKCE、Sa-Token 终端隔离、公开登录页与设备生命周期；T08 增加
provider/model/grant 管理、provider 密钥保护、有效默认解析和 runtime bootstrap 模型目录；T09
增加 Flyway `V6`、叠加配额、PostgreSQL reservation、Redis lease、结算恢复和用量 API；T10
增加请求级授权、三协议透明 upstream、原生 SSE、计费终态和模型调用审计；T13 增加
Flyway `V8`、不落地解压的 tgz 验包、RFC 8785 JCS/Ed25519、CAS 制品、插件状态/分配、下载授权与库存；T16
增加 Flyway `V9`、官方 Session format v0 精确 JSONL/hash、AES-GCM 远端副本、读取权限、tombstone 与 retention。T19 补齐显式审计白名单与查询/retention；T20 在模块前置增加 2 MiB 普通 JSON 上限、稳定 413 和未知故障秘密隔离。

## 身份边界

- OIDC 使用 Nimbus 完成 Discovery、Authorization Code + PKCE、声明算法/JWKS、issuer、
  audience 和 nonce 校验；原始 Token 与未映射 claims 不离开 adapter。
- LDAP 使用 manager search + user bind，要求 LDAPS 或 StartTLS 二选一，过滤值按 RFC 4515
  转义，并要求显式稳定属性（如 entryUUID），不回退到可变用户名。
- LOCAL 复用 Host BCrypt、Redis 失败计数和锁定策略，以 userId 为稳定 subject。
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
  `enterprise-admin` 只接受配置的精确 HTTP(S) redirect，两个 client 的参数和 Token 不能混用。
- Redis 登录事务 TTL 为 5 分钟，授权码 TTL 为 60 秒；code 使用 Redis `GETDEL` 先消费再校验，
  redirect/client/installation/verifier 任一不匹配都不能恢复或重放。
- Sa-Token 会话绝对有效期 12 小时且 `is-share=false`。Harness terminal 使用
  `deviceType=harness, deviceId=installationId`，管理端使用独立 `console` terminal。
- Runtime 设备授权只读取服务端 Sa-Token terminal，不信任 `X-Device-Id`。撤销设备更新数据库和
  审计同一事务，随后只注销该 installation 的 Harness Token；其他设备保持有效。

认证入口为 `/enterprise/auth/v1`，设备 Runtime 入口为 `/enterprise/api/v1/devices`，管理入口为
`/enterprise/admin/v1/devices`。设备管理读取与撤销分别要求 `ent:device:read/revoke`。

## 受管模型与 bootstrap 边界

- provider 创建时 credential 必填，只以 `PROVIDER_SECRET` 用途的 AES-256-GCM 密文保存；读取接口
  仅返回 `credentialConfigured`。更新必须显式给出 `replaceSecret`，未替换时保持原密文。
- provider test 使用草稿 base URL、timeout 和可选新 credential 请求 `/models`，不跟随重定向；
  响应正文以 4 MiB 为上限且只投影 OpenAI `data[].id`，连同成功、延迟和稳定状态类别返回。
- 模型、provider、grant 都为 `ACTIVE` 才能进入员工目录。USER 与当前 DEPT 授权取并集，默认优先级
  为 USER、DEPT、`sortOrder` fallback，客户端看不到 provider route 或上游模型名。
- Host `sys_user/sys_dept` 使用固定部署的全局主键；tenant 约束施加在 `ent_model_*` 企业事实链上。
  本模块不声称支持详细设计明确排除的 SaaS 多租户。
- `/enterprise/api/v1/bootstrap` 每次重新验证 `dsh-desktop` Token 对应的 ACTIVE 设备与当前用户，
  当前填充有效模型、全部适用配额和 USER>DEPT>ALL 插件期望；Session 同步策略仍由 T17 客户端独立实现。

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

## 模型网关边界

- `/enterprise/gateway/v1/chat/completions`、`/responses`、`/messages` 分别承接 Harness 官方
  Completions、Responses 与 Anthropic Messages 请求，只统一要求 UUID v4 幂等键、`stream=true` 和
  受管 alias/`enterprise/default`；其余原生协议字段透明保留并交给官方客户端与上游定义。
- 每个请求重新验证 ACTIVE `dsh-desktop` 设备、当前 ACTIVE 用户、grant、model 和 provider；客户端
  bootstrap 快照不是授权事实，上游模型名、base URL、协议和 credential 只来自服务端配置。
- 网络期间不持有数据库事务。SENT 与 accepted 审计在同一短事务，SETTLED/CHARGED_MAX 与 finished
  审计在另一短事务；流期间每 30 秒续租，断流、超时、取消或缺失 usage 按预留上限计费。
- JDK HttpClient 按 provider 协议固定请求 `/chat/completions`、`/responses` 或 `/messages`，选择 Bearer
  或 `x-api-key` 认证并禁止重定向。Server 只观察各协议 usage 和原生终态用于可信结算，不改写消息、
  tools、reasoning、replay 或 SSE；Responses/Anthropic 不要求虚构 `[DONE]`。
- Harness 的消息、tool、reasoning effort、Responses replay、取消和错误语义由官方
  `@deepseek-ai/dsh-llm-pi-ai` 负责，企业后端不得复制同一协议层。
- provider credential 仅在建连局部解密并清零临时 byte/char 容器；请求正文、原始上游错误、URL、
  Authorization、reasoning 和 tool 内容都不能进入异常、日志、审计或 ledger。

## 插件服务端边界

- multipart 上传先有界写入 `.part` 并计算整包 SHA-256，再由 Commons Compress 单遍读取；不解压到
  文件系统，拒绝路径逃逸、链接、设备文件、`.node`、安装脚本、非空 dependencies 与非精确 Harness peer。
- 整包按 SHA-256 内容寻址；同 hash 的终结和事务补偿由进程锁加 artifact root 文件锁串行化，
  避免并发失败删除其他 tenant 已引用制品。签名声明使用 RFC 8785 JCS 与 Ed25519 PKCS#8 私钥。
- 版本只允许 `UPLOADED -> VALIDATED -> PUBLISHED -> RETIRED`，只有 PUBLISHED 可新分配；相同
  package/version 或 tenant 内相同 SHA-256 返回已有版本，不复制事实。
- assignment 原子替换并按 USER、当前 DEPT、ALL 裁决，`ABSENT` 可以覆盖较低优先级安装期望。
  下载每次重验 ACTIVE 设备、当前用户和当前 assignment；assignment 已引用的退休版本仍可回滚下载。
- runtime 下载支持完整或单一 bytes Range，并固定 gzip、长度、ETag、attachment 与 `nosniff`；
  inventory 是当前设备最多 500 条 package 唯一的全量替换，数据库和审计同事务。

管理入口位于 `/enterprise/admin/v1/plugins`，使用 `ent:plugin:read/write`；runtime 入口位于
`/enterprise/api/v1/plugins`。部署必须配置 `enterprise.plugin.artifact-root` 和只读 PKCS#8
`enterprise.plugin.signing-private-key-file`；默认压缩/解压上限分别为 50 MiB/200 MiB。

## Session 服务端边界

- runtime batch 的 `payloadBase64` 解码为精确 UTF-8 JSONL；payload SHA-256 包含换行，rolling hash 只拼接
  raw event line，不重序列化 JSON。官方 rc.7 `SESSION_FORMAT_VERSION=0`，其他版本稳定拒绝。
- 首批从 seq 0 建立 owner/source device 绑定；后续在 replica 行锁内判定连续、完整幂等、gap、diverge 和
  跨设备冲突。数据库唯一键兜底并发幂等，不使用 JVM 本地锁表达复制事实。
- header、title 和每条 raw event line 分别用 `SESSION_CONTENT` AES-256-GCM 加密，AAD 绑定 tenant、表、
  replica/event ID、字段和 key version；event 表只额外保存 type/time 与 rolling-hash checkpoint。
- 员工只列出、导出和删除本人副本。管理 metadata 列表不解密正文；content 入口独立要求
  `ent:session:content:read` 且每次写审计，不能由 `ent:session:read` 隐式获得。
- 删除清空 header/title/event 密文并保留 `DELETED` tombstone；每日 retention 把 90 天未更新正文变为
  `EXPIRED`，两者都阻止后台重传。restore-record 只记录 Host 已完成的关联审计，本地新副本属于 T17。

runtime 入口位于 `/enterprise/api/v1/sessions`，管理入口位于 `/enterprise/admin/v1/sessions`。默认单批
上限 1 MiB、保留 90 天、每批清理 100 条，分别由 `enterprise.session.*` 配置覆盖。

## 安全与故障边界

- 普通 enterprise JSON 在 MVC 解序列化前有界读取，客户端不能用 chunked 绕过 2 MiB 限制；模型网关保留自己的 10 MiB 流式边界，插件 multipart 保留 50 MiB 制品精确计数。
- 数据库、Redis 或磁盘的未知运行时故障返回 retryable `ENT_PLATFORM_UNAVAILABLE`；服务端日志只写 requestId 和异常类型，不写可能含凭据的 message 或 stack。
- PostgreSQL、Redis、artifact 与 master/signing key 的隔离备份恢复由仓库 T20 演练脚本验证；生产入口、TLS 与可信代理由 T21 部署交付承担。

## 数据库

本模块只支持 PostgreSQL。Flyway migration 位于 `src/main/resources/db/migration`，假定 Host
PostgreSQL 基线已经存在，并为企业表创建显式外键、检查约束和索引。`V4` 向 `sys_role` 增加
真实的 `built_in` 列并写入固定角色和权限集合；`V5` 为默认 tenant `000000` 写入 LOCAL 身份源、
默认配额策略和 `BOOTSTRAP` revision；`V6` 冻结部署时区并给 reservation 增加可恢复 requestId；
`V8` 把历史 assignment 期望态前向迁移为 `INSTALLED/ABSENT` 并冻结客户端调和库存状态；`V9` 不修改
已发布 V3，而是前向把尚未启用的 Session `format_version > 0` 历史约束修正为官方 rc.7 的精确 v0。

## 测试

测试需要可用的 Docker daemon，并使用本机或自动拉取的 `postgres:17-alpine`、
`redis:8-alpine` 和 `osixia/openldap:1.5.0` 镜像：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false test
```

测试从真实 Host PostgreSQL 基线启动数据库，分别验证一次性迁移和逐版本升级；不会使用 H2
模拟 PostgreSQL 约束。身份/设备/网关测试还会启动 WireMock OIDC/DeepSeek、OpenLDAP StartTLS、
Redis 8 和 PostgreSQL 17 Testcontainers，并使用 OpenAPI 派生 JSON Schema 验证认证、设备、模型、
配额、bootstrap、用量、模型流、插件与 Session 接口的成功/失败响应。插件测试还覆盖恶意归档、
JCS/Ed25519、并发幂等上传、assignment 优先级、越权下载、退休回滚、库存原子替换和文件补偿；Session
测试覆盖精确字节 hash、连续/重复/gap/diverge/跨设备/并发、密文、正文权限、删除与 retention。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
