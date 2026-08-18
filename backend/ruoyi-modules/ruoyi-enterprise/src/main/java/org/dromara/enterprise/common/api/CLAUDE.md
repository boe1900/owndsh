# api/

> L2 | 父级: ../CLAUDE.md

成员清单

CursorPageData.java: 所有列表统一使用的 items/page 成功载荷。
CursorPageMetadata.java: 强制 hasMore 与 nextCursor 同构的分页元数据。
EnterpriseApiValidation.java: UUID v4 Idempotency-Key 与 1..200 page limit 公共校验。
EnterpriseCursorCodec.java: 使用 API_CURSOR AES-GCM、tenant 和 filter AAD 认证 keyset cursor。
EnterpriseError.java: 稳定 code/message/requestId/retryable/details 错误对象。
EnterpriseErrorResponse.java: 企业错误 envelope 根。
EnterpriseExceptionHandler.java: 身份/revision/Sa-Token/Spring 异常到详细设计稳定 status/code 的统一映射。
EnterpriseRequestIdFilter.java: 为每个企业请求生成并回写 canonical req_ ULID。
EnterpriseRequestIds.java: X-Request-Id 常量、request attribute 与 canonical ULID 生成入口。
EnterpriseResponse.java: 企业成功 data/requestId envelope 根。
RevisionConflictDetails.java: revision CAS 冲突的 expected/actual 固定 details。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
