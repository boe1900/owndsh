# model/gateway/

> L2 | 父级: ../CLAUDE.md

成员清单

EnterpriseGatewayProperties.java: 模型请求体与单个 SSE event 的部署上限配置，启动时拒绝非正值。
GatewayException.java: 网关授权、体积和上游失败的封闭稳定错误分类，不携带请求正文、URL 或上游响应。
GatewayChatRequest.java: 经严格校验的请求局部值，携带 reasoning 意图且只在上游发送前替换受管模型并强制 usage 流。
GatewayChatRequestParser.java: OpenAI-compatible 顶层白名单、thinking/effort 组合、纯文本 message/tool 校验与可见字节估算入口。
GatewayRouteResolver.java: 每请求重读 ACTIVE 设备、用户、授权、模型和 provider 的可信 route 裁决器。
DeepSeekUpstreamClient.java: DeepSeek-compatible SSE 建连端口与脱敏 event/exchange 契约。
JdkDeepSeekUpstreamClient.java: JDK HttpClient 无重定向实现，按 provider timeout 限制建连/event 读取且不读取错误正文。
GatewayAcceptedMetadata.java: MODEL_REQUEST_ACCEPTED 审计的 model/reservation/estimate 白名单。
GatewayFinishedMetadata.java: MODEL_REQUEST_FINISHED 审计的终态、usage、耗时与稳定失败码白名单。
ModelGatewayService.java: reasoning 能力复核、配额预留、SENT、短事务审计、SSE 转发、续租与 SETTLED/CHARGED_MAX 的生命周期编排。
ModelGatewayController.java: `/enterprise/gateway/v1/chat/completions` 的限量读取、UUID v4 幂等键与首字节前后响应边界。
EnterpriseModelGatewayConfiguration.java: 网关 composition root，连接模型、设备、配额、crypto、audit 与事务端口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
