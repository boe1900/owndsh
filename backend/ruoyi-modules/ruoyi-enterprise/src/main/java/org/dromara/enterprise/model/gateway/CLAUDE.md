# model/gateway/

> L2 | 父级: ../CLAUDE.md

成员清单

EnterpriseGatewayProperties.java: 模型请求体与单个 SSE event 的部署上限配置，启动时拒绝非正值。
GatewayException.java: 网关稳定错误码与仅供服务端诊断的封闭失败阶段，允许状态/request ID 且禁止正文、URL 和 credential。
GatewayChatRequest.java: 原生请求的防御性副本，在上游发送前只替换受管模型并强制流式 usage/no-store 治理字段。
GatewayChatRequestParser.java: 仅校验受管 model、stream 与协议输出上限，其余原生协议字段保持透明。
GatewayRouteResolver.java: 每请求重读 ACTIVE 设备、用户、授权、模型和 provider 的可信 route 裁决器。
DeepSeekUpstreamClient.java: 三种 Harness wire API 的 SSE 建连端口与脱敏 event/exchange 契约。
JdkDeepSeekUpstreamClient.java: JDK HttpClient 无重定向实现，按协议选择 endpoint/auth、限制建连/event 读取，非 2xx 仅记录限量白名单 code/type/param，重试策略由 Harness 持有。
GatewayAcceptedMetadata.java: MODEL_REQUEST_ACCEPTED 审计的 model/reservation/estimate 白名单。
GatewayFinishedMetadata.java: MODEL_REQUEST_FINISHED 审计的终态、usage、耗时与稳定失败码白名单。
ModelGatewayService.java: 编排三协议透明 relay、配额预留估算、usage/终态观察、脱敏故障日志与续租；保守估算不裁决模型上下文，上游确认 2xx SSE 后才提交 SENT/accepted，建连失败释放，流内失败保留 CHARGED_MAX。
ModelGatewayController.java: 三个 Harness 原生 wire 路径的限量读取、协议选择、UUID v4 幂等键与建连前 JSON/建连后 SSE 错误边界。
EnterpriseModelGatewayConfiguration.java: 网关 composition root，连接模型、设备、配额、crypto、audit 与事务端口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
