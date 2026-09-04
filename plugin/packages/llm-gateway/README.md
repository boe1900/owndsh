# @owndsh/llm-gateway

DeepSeek Harness rc.2 官方 `@deepseek-ai/dsh-llm-pi-ai` 的企业配置桥。本包不实现
`LlmAdapter`，也不解析或转换 message、tool、reasoning、replay 与 SSE。

## 职责

- `profiles.ts` 把 `EnterprisePlatformService.bootstrap()` 中的受管模型投影为官方
  `PiAiProviderProfile`。三个 route 分别使用 `openai-completions`、`openai-responses` 和
  `anthropic-messages`；profile 按官方 SDK 约定分别处理 OpenAI `/v1` base URL 与 Anthropic
  自动追加的 `/v1/messages`，`enterprise/default` 始终指向当前有效默认模型。
- `registration.ts` 直接挂载官方 `dsh-llm-pi-ai` Cordis 插件。bootstrap 变化时更新官方
  profiles；目录、reasoning effort 校验、消息转换、回放、取消、重试和流终态全部由官方插件负责。
- `proxy.ts` 提供 Host 私有 loopback 认证代理。它每次启动绑定随机端口并生成随机
  bearer；官方 adapter 向其发送原生协议请求，代理移除本机认证、注入幂等/版本 header，
  再通过 `EnterprisePlatformService.request()` 使用内存平台 Token。

该代理不挂载 Harness/Desktop 的浏览器 WebServer，因此 Electron renderer 访问门禁不会误拦 Host
内部模型请求，普通本机进程也无法借用已登录会话。认证代理把中心调用显式标记为
`Accept: text/event-stream, application/json`：平台客户端据此取消
模型流总时限，同时 Server 仍可在 SSE 提交前返回配额、授权等 JSON 错误。成功请求和响应字节保持透明；
平台声明为不可重试的 429 会在本机 provider 错误 envelope 中标记为终态 quota，使官方 pi-ai 分类为 `QUOTA`，
而不是按通用 429 进入 `RATE_LIMIT` 重试。

## 边界

企业端只提供认证、授权、配额、审计、受管模型 ID 覆盖和上游密钥注入。新增模型协议能力必须先
升级或配置官方 `dsh-llm-pi-ai`；不得在本包增加 serialize/translate/transport/wire 层，也不得引入
Spring AI 等第二套协议抽象。

企业 profile 不覆盖 provider `retryPolicy`，由 Harness 官方 `dsh-llm-retry` 恢复层执行有界默认策略；
SDK、认证代理和企业网关均不叠加重试。每次重试仍是独立的平台请求，分别接受授权、配额和审计。
上游 API Key 不进入 Harness 环境、settings 或磁盘；平台 Token 仍只有
`EnterprisePlatformService.request()` 能读取。

运行时 peer 精确固定为 `@deepseek-ai/dsh-llm-pi-ai@0.1.1-rc.2`。本包与 bundle 的
`skipLibCheck` 只隔离链接上游 `@anthropic-ai/sdk` 的损坏声明文件，自有 TypeScript 仍在严格模式下检查。
