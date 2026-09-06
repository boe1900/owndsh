# model/gateway/

> L2 | 父级: ../CLAUDE.md

成员清单

EnterpriseGatewayProperties.java: 模型请求体与单个 SSE event 的部署上限配置，启动时拒绝非正值。
GatewayException.java: 网关稳定错误码与仅供服务端诊断的封闭失败阶段，允许状态/request ID/合法 Retry-After 且禁止正文、URL 和 credential。
GatewayChatRequest.java: 原生请求的防御性副本，在上游发送前写入已校验的有效输出上限、受管模型与流式 usage/no-store 治理字段。
GatewayChatRequestParser.java: 校验受管 model、stream 与协议输出上限，支持 Completions 新旧上限字段，拒绝非正整数、非空字段混用并提取唯一 wire 字段，其余原生协议字段保持透明。
GatewayRouteResolver.java: 每请求重读 ACTIVE 设备、用户、授权、模型和 provider 的可信 route 裁决器。
DeepSeekUpstreamClient.java: 三种 Harness wire API 的 SSE 建连端口与脱敏 event/exchange 契约。
JdkDeepSeekUpstreamClient.java: JDK HttpClient 无重定向实现，按协议选择 endpoint/auth、限制建连/event 读取，以安全 code/type 区分 429 瞬时限流与硬额度并保留合法 Retry-After，重试策略由 Harness 持有。
GatewayAcceptedMetadata.java: MODEL_REQUEST_ACCEPTED 审计的 model/reservation/estimate 白名单。
GatewayFinishedMetadata.java: MODEL_REQUEST_FINISHED 审计的终态、usage、耗时与稳定失败码白名单。
GatewayUsageInspector.java: 三协议最终 usage/终态观察器，缓存别名优先取值、读写量独立相加，最终 usage 可在结束帧抵达前保存。
ModelGatewayService.java: 统一输出上限、发送前意图与全程续租；静默上游期间每 5 秒由正文写线程发送 SSE 心跳，取消先停上游再幂等结算，usage 快照与取消串行且传输失败不抹去实测量。
ModelGatewayController.java: 三协议限量读取与 JSON/SSE 边界；使用 Servlet 可刷出响应流避免 Spring 非 flush 包装阻塞 SSE，异步错误/超时/完成统一关闭并幂等结算。
EnterpriseModelGatewayConfiguration.java: 网关 composition root，连接模型、设备、配额、crypto、audit 与事务端口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
