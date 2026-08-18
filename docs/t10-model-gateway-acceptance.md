# T10 模型网关验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T10 已完成，且没有进入 T11。Server 已提供 `/enterprise/gateway/v1/chat/completions`：每次请求重新
裁决设备、用户、模型授权和 provider route，使用中心保存的 provider credential 调用
DeepSeek-compatible `/chat/completions`，并把 reasoning、tool calls、usage 与 `[DONE]` 作为
OpenAI SSE 原样转发。调用接入 T09 reservation/Redis lease/ledger，并用同一 requestId 写 accepted
与 finished 审计。本任务没有实现 Harness `LlmAdapter`、provider 覆盖或真实企业组合对话。

实现复审发现并修正了两处边界：上游 exchange 的关闭状态原先是跨续租线程和流线程共享的普通
boolean，现改为原子幂等关闭并稳定分类关闭竞态；消息白名单中的 `name`、`tool_call_id` 和
`reasoning_content` 现执行与 OpenAPI 一致的文本类型校验，不让“字段名合法、字段值任意”穿过闸门。

## 核心实现

- `org.dromara.enterprise.model.gateway` 是独立纵向模块：Controller 负责 10 MiB 限量读取、UUID v4
  幂等键和 HTTP/SSE 边界；parser 负责严格 OpenAI-compatible 请求；route resolver 负责授权；
  service 负责编排配额、上游、审计和流生命周期；JDK adapter 只负责 HTTP/SSE 字节协议。
- `model` 只能是有效 alias 或 `enterprise/default`。解析器拒绝 `stream=false`、未知顶层字段、
  provider/base URL 等 route 伪造、多模态 content、未知 message/tool 字段和错误字段类型；发送前
  只用服务端 `upstreamModel` 替换 model，并强制 `stream_options.include_usage=true`。
- route 每请求重新读取 Sa-Token terminal 对应 ACTIVE 设备、当前 ACTIVE RuoYi 用户、USER+DEPT
  有效授权、ACTIVE model 和 ACTIVE provider。客户端 header、alias 猜测或旧 bootstrap 不能授权。
- Token 估算复用 T09 唯一算法。reserve 成功后，SENT 与 `MODEL_REQUEST_ACCEPTED` 在同一短事务；
  网络期间不持有数据库事务；SETTLED/CHARGED_MAX 与 `MODEL_REQUEST_FINISHED` 在另一短事务。
- 流期间每 30 秒续租 120 秒 Redis 并发 lease 和 15 分钟 reservation。有效 usage 结算实际分类
  Token；无 usage、断流、客户端取消、timeout 或续租失败都按预留上限 `CHARGED_MAX`。事务失败
  保留可由 T09 恢复任务领取的 SENT reservation，不伪造部分 ledger 或 finished 审计。

## 上游与错误边界

JDK HttpClient 固定 POST provider base URL 下的 `/chat/completions`，发送 Bearer credential，禁止
重定向，限制建连/首响应和逐 SSE event 读取时间，并限制单 event 为 1 MiB。401/403、408/504、
429/5xx、错误 content-type、非法 JSON、error event、断流和超大 event 都映射为封闭稳定类别；
上游错误正文从不读取，`X-Request-Id` 只有匹配安全字符白名单时才进入 ledger。

服务端在返回 200 前预取并校验首个 SSE event，因此建连、状态、content-type 和首帧失败保持
第 17 节普通 JSON 错误。任何 SSE 字节写出后的失败只发送
`enterprise_gateway_error` data frame，包含稳定 code 和平台 requestId，不把错误文本伪装成
assistant content。已收到 `[DONE]` 但缺少 usage 的不确定调用按上限计费，并仍按上游协议结束流。

provider credential 只在发起上游请求的局部作用域解密；临时明文字节和字符数组在 finally 清零。
请求正文、Authorization、credential、provider URL、原始上游错误、reasoning 和 tool 内容均不进入
异常、审计、ledger 或应用日志。accepted/finished metadata 只保留 model/reservation、估算/结算
Token、终态、耗时和稳定失败类别。

## 协议验收

OpenAPI 逻辑真源新增 `components/gateway.yaml`、`paths/gateway.yaml`、一个成功 fixture 和一个 route
伪造负例，总 operation 数从 52 增至 53，冻结错误码仍为 36 个。TypeScript contracts facade 公开
gateway DTO 与 strict Zod；成功响应明确是 `text/event-stream`，不套企业 JSON success envelope。

当前共有 33 个正反 fixture，完整逻辑协议 SHA-256 为：

```text
aa016c19495c1769625946263134baa0fb845a701234f1e86c05ddb6e593f0dc
```

## 自动验收

T10 定向服务端门禁：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=GatewayChatRequestParserTest,GatewayRouteResolverTest,DeepSeekUpstreamClientTest,ModelGatewayServiceTest,ModelGatewayTransactionIntegrationTest,T10GatewayApiContractTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

结果：18 项全部通过。WireMock 覆盖 reasoning/tool/usage、401/429/5xx、content-type、no-redirect、
断流和 timeout；生命周期测试覆盖 alias/default、首字节前后错误、缺失 usage、取消与脱敏错误帧；
PostgreSQL 17 测试证明 SENT/accepted 与 ledger/finished 原子提交，并证明 finished 审计失败时 ledger
和 reservation 终态共同回滚。

后端完整门禁：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false test
```

结果：92 项全部通过，包含 PostgreSQL 17、Redis 8、OpenLDAP、WireMock、迁移、身份、PKCE、设备、
模型、配额、模型网关、revision 与审计纵向回归。

跨端协议与插件 workspace 门禁：

```sh
corepack pnpm --filter @enterprise-agent/dsh-contracts generate
corepack pnpm --filter @enterprise-agent/dsh-contracts check:generated
corepack pnpm run check
```

结果：生成无漂移，6 个 package 的 typecheck/build 全部通过；contracts 6 项、llm-gateway 4 项、
session-sync 3 项、UI 7 项、platform-client 18 项、bundle 3 项与 workspace 4 项不变量全部通过。

## 上游与边界门禁

```sh
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

三份上游锁均匹配。同级 `deepseek-harness` 保持 detached HEAD
`47f943859bef60e4160492346772ded9b24f765a` 且工作区干净；本任务没有修改任何 Harness 文件。
敏感模式扫描没有发现生产 credential、prompt、Authorization 或上游错误正文输出入口。新增业务
Java 文件均带 L3 契约且少于 800 行，gateway、测试、协议、配置与文档 L2 地图已同步。

## 任务边界

T11 可以在独立后续任务实现 `EnterpriseGatewayAdapter`、动态企业模型目录、default sentinel、取消、
单次尝试和 bundle provider 覆盖，并用锁定 Harness 完成“企业登录后无本地上游 Key”的真实组合
对话。T10 没有修改同级 Harness、没有实现客户端 adapter，也没有提前进入插件或 Session 功能；
详细设计中的 T11-T23 仍为 `pending`。
