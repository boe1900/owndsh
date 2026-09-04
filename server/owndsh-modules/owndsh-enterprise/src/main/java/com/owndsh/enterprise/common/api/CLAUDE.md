# api/

> L2 | 父级: ../CLAUDE.md

成员清单

CursorPageData.java: 所有列表统一使用的 items/page 成功载荷。
CursorPageMetadata.java: 强制 hasMore 与 nextCursor 同构的分页元数据。
EnterpriseApiValidation.java: UUID v4 Idempotency-Key 与 1..200 page limit 公共校验。
EnterpriseCursorCodec.java: 先以 SHA-256 规范化任意 filter scope，再使用 API_CURSOR AES-GCM 与 tenant AAD 认证 keyset cursor。
EnterpriseError.java: 稳定 code/message/requestId/retryable/details 错误对象。
EnterpriseErrorResponse.java: 企业错误 envelope 根。
EnterpriseExceptionHandler.java: 业务异常到稳定 status/code 的统一映射，设备撤销固定 403、上游 429 保留合法 Retry-After；未知故障只记录 requestId 和类型。
EnterpriseHttpProperties.java: 普通企业 JSON 请求体的 2 MiB 默认上限与正数绑定边界。
EnterpriseJsonBodyLimitFilter.java: MVC 解序列化前有界读取 JSON，Content-Length 和 chunked 超限共用稳定 413。
EnterpriseRequestIdFilter.java: 为每个企业请求生成并回写 canonical req_ ULID。
EnterpriseRequestIds.java: X-Request-Id 常量、request attribute、HTTP 复用与后台任务 canonical ULID 生成入口。
EnterpriseRequestMetadata.java: 从可信 Servlet 请求投影 requestId、来源 IP 和 SHA-256 user-agent hash，禁止业务层读取任意 header。
EnterpriseResponse.java: 企业成功 data/requestId envelope 根。
RevisionConflictDetails.java: revision CAS 冲突的 expected/actual 固定 details。
QuotaExceededDetails.java: 四类配额 429 的 policyId/reset 固定 details。
RequestConflictDetails.java: 幂等键进行中/已完成 409 的原 requestId/result 固定 details。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
