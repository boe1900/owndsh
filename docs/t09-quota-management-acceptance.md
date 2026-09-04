# T09 配额管理验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T09 已完成，且没有进入 T10。Server 已提供 quota policy/window 管理、PostgreSQL Token 预留、
Redis RPM/并发 lease、SENT 后结算、过期恢复、员工本人实时用量和管理员 prompt-free ledger 查询。
ACTIVE 设备 bootstrap 现在返回全部适用配额；本任务没有调用上游模型、实现 OpenAI SSE 或修改
同级 DeepSeek Harness。

实现审阅发现原详细设计缺少两个可恢复事实：reservation 没有持久化 requestId，部署时区也没有
数据库真源。详细设计先修订，再新增不可变 `V6__enterprise_quota_runtime.sql`：首次启动原子写入
`ENT_DEPLOYMENT_TIME_ZONE`，后续漂移拒绝启动；reservation 同时保存服务端 requestId，使崩溃
恢复生成的 ledger 与审计仍可关联原请求。已发布 V1 没有被改写。

## 核心实现

- `com.owndsh.enterprise.quota` 按 domain/application/persistence/web 分层；Spring composition root
  只装配 JDBC、Redisson、事务、冻结时区、bootstrap resolver 和每分钟恢复任务。
- 策略支持 list/get/create/update/delete/enable/disable/current windows，DEFAULT 要求空 subject，
  DEPT/USER 要求真实 原始服务端框架 主体，至少一个 limit 为正；所有写入使用 revision CAS、递增 bootstrap
  revision，并在同一事务写 `QUOTA_CHANGED` 审计。
- 生效规则同时应用全部 ACTIVE DEFAULT、当前 DEPT 与 USER 策略，不做覆盖合并。resolver 在
  application 层强制按 policy ID 排序，不把 JDBC 返回顺序当作隐式正确性条件。
- 日/月窗口按冻结 IANA 时区的自然边界计算。可见 system/messages/tools 的 UTF-8 字节数除三
  向上取整；所有窗口在 PostgreSQL 短事务中创建或锁定，再原子增加 reserved tokens。
- 预留、结算、释放和恢复统一按 `policyId + DAY/MONTH` 顺序加锁；审阅中纠正了按 window ID
  结算可能与按 policy ID 预留形成反向锁序的问题，并用乱序 adapter/window 回归测试守住规则。
- Redis 单个 Lua 对全部适用策略先检查后写入，RPM 使用 60 秒滑窗，并发 lease 使用 120 秒 TTL；
  获取全成全败，支持续租、显式释放和 TTL 回收。Redis 拒绝或失败会释放数据库预留。
- reservation 使用 `(user_id,idempotency_key)` 唯一约束，状态只允许 RESERVED/SENT 进入
  RELEASED/SETTLED/CHARGED_MAX。重复进行中与已结束分别返回稳定 409，不缓存或重放历史流。
- 过期恢复使用 `FOR UPDATE SKIP LOCKED`：RESERVED 释放，SENT 按估算上限生成唯一 ledger；
  reservation 固化的窗口快照用于结算，不按已变化的策略重建历史事实。

## API 与安全边界

OpenAPI 新增 10 个 operation，总数从 42 增至 52：配额 CRUD/启停/窗口、ACTIVE 设备
`/enterprise/api/v1/usage/me` 和管理员 `/enterprise/admin/v1/usage`。管理读取与写入复用冻结的
`ent:grant:read/write` 权限；创建要求 UUID v4 `Idempotency-Key`，修改/状态/删除要求 `If-Match`。
删除不存在的 quota 明确返回 404；用量查询在设备有效但 原始服务端框架 用户失效时返回 403，不把访问主体
失效伪装成配额资源不存在。管理员 ledger 的 requestId 筛选严格接受协议定义的 canonical ULID。

统一异常边界新增四类 429 `QuotaExceededDetails` 和两类幂等 409 `RequestConflictDetails`。MockMvc
对全部 10 个 operation 发出真实成功与失败请求，并用同源 JSON Schema 验证；额外验证 404、
revision 409、两类幂等 409 和四类 429 的稳定 code/details。

ledger 只输出分类 Token、result、requestId、上游 requestId 和时间，不包含 prompt、messages、
provider route、credential 或 tenant 内部字段。员工本人用量每次重新验证 Sa-Token terminal 对应
的 ACTIVE `dsh-desktop` 设备 owner 与当前 ACTIVE 原始服务端框架 用户。

## 协议验收

协议新增 `components/quota.yaml`、`paths/quota.yaml`、5 个成功 fixture 和 5 个独立 JSON Schema；
bootstrap fixture 改为真实 DEFAULT 配额。TypeScript package facade 公开 quota/usage DTO 与 strict
Zod，不要求业务包越过 facade 直接依赖生成文件。当前共有 31 个正反 fixture、36 个稳定错误码，
完整逻辑协议 SHA-256 为：

```text
d539acd1cb205f267f2ee985d8109adb514e4ebe8286a73b99d0702ac6516db1
```

## 自动验收

T09 定向服务端门禁：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false \
  -Dtest=QuotaOrderingTest,QuotaWindowCalculatorTest,RedisQuotaRateLimiterTest,QuotaManagementIntegrationTest,T09ApiContractTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

结果：10 项全部通过。PostgreSQL 17 测试实际发起 50 个并发预留，25 个成功、25 个收到 quota
拒绝，窗口 reserved 精确为 250 且无超卖；同时覆盖时区漂移、策略/CAS/bootstrap、RELEASED、
SENT、SETTLED、CHARGED_MAX、两类幂等冲突、过期恢复、ledger 聚合与审计。Redis 8 测试覆盖
多策略 Lua 全成全败、RPM、并发续租、显式释放与 TTL 回收。

后端完整门禁：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false test
```

结果：74 项全部通过，包含 PostgreSQL 17 V1→V6 逐版本/空库/Boot 自动迁移、Redis 8、
OpenLDAP、WireMock、身份、PKCE、设备、模型、revision、审计和配额纵向回归。

跨端协议与插件 workspace 门禁：

```sh
pnpm --filter @owndsh/contracts generate
pnpm --filter @owndsh/contracts check:generated
pnpm run check
```

结果：生成无漂移，6 个 package 的 typecheck/build 全部通过；contracts 5 项、llm-gateway 4 项、
session-sync 3 项、UI 7 项、platform-client 18 项、bundle 3 项与 workspace 4 项不变量全部通过。

## 上游与边界门禁

```sh
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

三份上游锁均匹配。同级 `deepseek-harness` 保持 detached HEAD
`47f943859bef60e4160492346772ded9b24f765a` 且工作区干净；本任务没有修改任何 Harness 文件。
新增业务 Java 文件均带 L3 契约且少于 800 行，quota 四层、migration、测试、协议、package facade
与文档 L2 地图已同步。

## 任务边界

T10 可以在独立后续任务实现 DeepSeek upstream client、模型授权裁决、OpenAI SSE、调用审计，并
把网关生命周期接入本任务的预留/续租/markSent/结算接口。T09 没有提前实现真实模型调用、SSE
首字节错误映射或 Harness provider 覆盖；详细设计中的 T10-T23 仍为 `pending`。
