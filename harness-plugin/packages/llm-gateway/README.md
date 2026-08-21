# @enterprise-agent/dsh-llm-gateway

DeepSeek Harness rc.7 的企业受管模型 adapter。该包只使用官方 `LlmAdapter`、
`LlmRuntime.registerAdapter()` 和 registration `replace()`，不读取个人模型设置、上游
URL、上游 API Key 或平台 Token。

`EnterpriseGatewayAdapter` 注册唯一 provider `enterprise`。模型目录来自
`EnterprisePlatformService.bootstrap()`；`enterprise/default` 在调用时解析为当前用户的
有效默认模型，但仍以 sentinel 发给中心网关，由服务端逐请求重新裁决授权。模型目录事实变化时，
`registerEnterpriseGateway()` 对现有 registration 原子执行 `replace(['enterprise'])`，复用
官方 `llm/adapters-updated` 通知选择器。Harness Runtime 在进入 adapter stream 前执行模型解析，
服务端仍对每个请求执行独立二次授权。

模型调用固定发送到中心 `/enterprise/gateway/v1/chat/completions`。Harness attribution、
幂等键和版本 header 由 adapter 生成，平台 `Authorization` 只由
`EnterprisePlatformService.request()` 在 Host 内存中注入。请求支持纯文本消息、reasoning、
function tools、sampling、stop 和 usage；响应转换为官方 reasoning/text/tool/usage/finish chunk。

网关调用使用单次尝试策略，避免对计费状态未知的流自动重放。HTTP 与流内错误只保留稳定 code、
status 和 requestId，不透传中心或上游原始 message。调用方取消和提前停止消费都会 abort fetch、
取消 reader 并等待停稳。

运行时 peer 精确固定为 `@deepseek-ai/dsh-llm@0.1.0-rc.7`。发布 bundle 会内联本包的产品代码，
但保留官方 LLM Service Definition 为 peer，由 rc.7 profile 的 app dependency fallback 解析，
不打包第二份 Harness runtime。
