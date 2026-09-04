# T11 Harness 模型链路验收记录

状态：`completed`，2026-08-25 按官方协议实现重构

## 结论

企业 bundle 不再实现 `EnterpriseGatewayAdapter`。它直接挂载 DeepSeek Harness rc.7 官方
`@deepseek-ai/dsh-llm-pi-ai`，因此模型目录、消息、tools、reasoning、Responses replay、SSE、取消、
错误和三协议兼容语义都由 Harness 官方层负责。

企业插件只保留两座桥：bootstrap 到官方 `PiAiProviderProfile` 的纯配置投影，以及 loopback-only
认证代理。员工登录后无需在本机配置上游 API Key；平台 Token 仍只存在于
`EnterprisePlatformService` 内存中。

## 核心实现

- `profiles.ts` 按 `openai-completions`、`openai-responses`、`anthropic-messages` 建立三个官方
  provider route，按官方 SDK 约定处理 OpenAI `/v1` 与 Anthropic 自动追加 `/v1/messages` 的 base URL，
  并为当前有效默认模型建立 `enterprise/default` sentinel。
- 模型 `contextWindow`、`maxTokens`、`reasoningEfforts` 和 `compat` 原样投影到官方 profile；企业代码
  不解释 effort，也不做 OpenAI/Anthropic 私有映射。
- `registration.ts` 直接以 Cordis fiber 挂载官方插件；bootstrap 指纹变化时调用官方 update，目录
  topology 仍由 `ctx.llm` 管理。
- `proxy.ts` 只允许 loopback，请求正文与 SSE 字节透明 relay；本机伪 Authorization 不会发往平台，
  平台 Bearer Token 由 `EnterprisePlatformService.request()` 注入。
- proxy 强制中心请求同时接受 `text/event-stream` 与 `application/json`，既避免模型流触发平台客户端
  30 秒普通请求总超时，也允许配额、授权等建连前错误保持稳定 JSON。
- 企业 profile 不覆盖 provider `retryPolicy`；Harness 官方 `dsh-llm-retry` 执行有界默认策略，SDK、
  认证代理和企业网关不叠加重试。每次重试仍作为独立平台请求分别执行授权、配额与审计。

## 协议所有权

`dsh-llm-pi-ai` 是唯一模型协议实现。企业层只负责认证代理、授权、配额、审计、受管模型 ID 覆盖和
上游密钥注入。后续新增模型、reasoning 档位、消息类型或 replay 能力时，应升级/配置官方包，不得
在产品仓库恢复 adapter、serialize、translate、transport 或 wire 模块。

`skipLibCheck` 只在直接链接官方包的 `llm-gateway` 和 bundle declaration build 中启用，用于隔离
上游 `@anthropic-ai/sdk` 无法解析相对 `undici-types` 的声明缺陷；产品代码仍使用 workspace 严格配置。

## 自动验收

```sh
corepack pnpm@11.7.0 --dir plugin run typecheck
corepack pnpm@11.7.0 --dir plugin --filter @owndsh/llm-gateway test
```

最小回归覆盖三协议 profile、default/reasoningEfforts、透明 relay、平台 SSE 标记和本机认证隔离。

真实 bundle 组合验收：

```sh
corepack pnpm@11.7.0 --dir plugin run pack:bundle
corepack pnpm@11.7.0 --dir plugin run accept:t11-model -- \
  --tgz ../artifacts/owndsh-plugin-0.1.0.tgz
```

`scripts/t11-harness-model-smoke.mjs` 使用未修改的锁定 Harness `web` profile，验证：

1. 真实 PKCE、Token、enroll、bootstrap 后动态出现四个企业 route 和 default sentinel。
2. 官方 `ctx.llm.stream()` 分别完成 Completions、Responses 与 Anthropic Messages 原生流。
3. `xhigh` 由官方层写为 Responses `reasoning: { effort: 'xhigh', summary: 'auto' }`。
4. bootstrap 模型变化通过官方 profile update 刷新目录。
5. 所有中心请求使用内存平台 Token、UUID 幂等键和版本 header，且 `Accept` 同时声明 SSE/JSON。
6. 真实 Agent 请求首次收到 503 后产生一个 `llm/retry`，继承官方 `normal/maxRetries=2` 并在第二次
   请求成功；平台观察到主 Agent 的两次独立请求。
7. 临时 `DSH_HOME` 不包含平台 Token 或任何上游 API Key；锁定 Harness 工作区保持 clean。

## 2026-08-26 真实部署回归

- 保留原 PostgreSQL/Redis 与 7 个 ACTIVE 模型，仅原地替换 Server 后，Gateway、Server、PostgreSQL、
  Redis 均为 healthy，`/healthz` 返回 200。
- 已登录的 Harness 显示“企业 · 已连接”，以 `gpt-5.6-sol`、`Xhigh` 发送唯一探针，4 秒完成、
  首 token 4.8 秒，精确返回 `E2E_XHIGH_DEPLOY_OK_0826`，客户端无 warning/error。
- 同一请求的 ledger 为 `SETTLED`，input/output/total 为 `10524/15/10539`；
  `MODEL_REQUEST_ACCEPTED` 与 `MODEL_REQUEST_FINISHED` 均为 `SUCCESS`，请求后无失败审计。
- Harness contracts/platform-client/llm-gateway/bundle 共 36 项通过，后端网关与事务定向回归 23 项通过；
  真实锁定 Harness smoke 覆盖三协议、Xhigh、授权/配额/设备拒绝和 Token 不落盘。
- 长会话耗尽日配额后曾暴露代理只接受 SSE、Server 无法返回 JSON 429 的媒体协商偏差；代理现同时
  接受 SSE/JSON，定向插件 24 项、Server 契约 4 项和锁定 Harness 三协议/错误矩阵均通过。

## 安全边界

平台和上游 credential 均不写入 Harness settings、环境或磁盘。认证代理只转发明确的协议 header，
不接受外部网络调用；请求正文、reasoning、tool 和原始 provider 错误不进入企业日志或本地状态。
