# T10 模型网关验收记录

状态：`completed`，2026-08-25 按官方 Harness 协议边界重构

## 结论

Server 提供三个协议原生入口：

- `POST /enterprise/gateway/v1/chat/completions`
- `POST /enterprise/gateway/v1/responses`
- `POST /enterprise/gateway/v1/messages`

企业网关不再把三种协议统一转换为 OpenAI Chat，也不解释 message、tool、reasoning 或 replay。
它只执行请求级认证、授权、配额、审计、受管模型 ID 覆盖和上游 credential 注入，并透明 relay
Harness 官方 adapter 生成的原生 JSON/SSE。

## 服务端边界

- Controller 对三个精确路径执行 10 MiB 限量读取、UUID v4 幂等键校验和协议选择。
- Parser 只读取 `model`、`stream=true` 与协议输出上限；未知原生字段和多模态内容保持透明。
- Route resolver 每请求重读 ACTIVE 设备、用户、grant、model 和 provider；bootstrap 不是授权事实。
- 发送前只替换服务端受管模型 ID。Completions 强制 `stream_options.include_usage=true`，Responses
  强制 `store=false`；其他协议字段不改写。
- JDK HttpClient 按 provider 协议选择 `/chat/completions`、`/responses`、`/messages` 以及 Bearer/
  `x-api-key`，禁止重定向，只提取上游错误的安全诊断字段；每次调用只发送一次，重试由 Harness 决定。

## 配额与流

网络期间不持有数据库事务。上游确认 2xx SSE 后，SENT 与 accepted 审计同事务；确认前失败则
RELEASED、零 ledger，SETTLED/CHARGED_MAX 与 finished 审计同事务；流期间每 30 秒续租。Server
只观察协议原生终态与 usage 以完成可信结算：

- Completions 以 `[DONE]` 结束，使用 OpenAI usage。
- Responses 以 `response.completed` 或 `response.incomplete` 结束，不要求 `[DONE]`。
- Anthropic 以 `message_stop` 结束，并合并 `message_start`/`message_delta` usage。

协议终态事件只在 SETTLED/CHARGED_MAX 与 finished 审计事务提交后写出；事务失败时发送协议错误帧，
不能先向 Harness 宣告成功再追加失败。

无 usage、断流、取消、timeout 或续租失败按预留上限计费。已写出 SSE 后的错误使用对应协议的
error frame；请求正文、credential、provider URL、原始上游错误、reasoning 和 tool 内容不进入日志、
审计或 ledger。

## 协议真源

OpenAPI 使用公共 `NativeGatewayRequest`：只约束企业治理字段，并允许协议扩展字段。三个 operation
成功响应均为 `text/event-stream`。TypeScript/Zod 与 JSON Schema 继续由同一 OpenAPI 自动生成。

## 自动验收

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
./mvnw -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=GatewayChatRequestParserTest,ModelGatewayServiceTest,T10GatewayApiContractTest,DeepSeekUpstreamClientTest,EnterpriseJsonBodyLimitFilterTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

2026-08-25 定向结果：22 项通过，覆盖三路径、透明 schema、三种 endpoint/auth、Responses/Anthropic
无 `[DONE]` 终态、usage 结算、错误、取消和请求体边界。

2026-08-27 故障回归：17 项通过。WireMock 证明 provider 特定 400 不触发服务端重试；真实
PostgreSQL 证明 2xx 前失败为 `RELEASED`、无 ledger、零 Token，2xx 后取消仍为 `CHARGED_MAX`。

```sh
corepack pnpm@11.7.0 --dir harness-plugin --filter @enterprise-agent/dsh-contracts test
node --test deploy/tests/deployment.test.mjs
```

结果：contracts 9 项与部署 10 项通过；Nginx 对三个精确模型路径均关闭 buffering 并使用长流超时。

## 设计约束

新增协议能力先进入锁定 DeepSeek Harness 的 `dsh-llm-pi-ai`，企业网关只增加必要的透明 endpoint、
治理字段和 usage/终态观察。不得恢复企业自研 serialize/translate/transport/wire adapter，也不引入
Spring AI 等第二套模型协议层。
