/**
 * [INPUT]: 依赖生成的 EnterpriseErrorResponse Zod schema、错误 DTO 类型和 code→HTTP status 映射
 * [OUTPUT]: 对外提供 decodeEnterpriseError 与 enterpriseErrorHttpStatus，未知或畸形错误 fail closed
 * [POS]: contracts 的 HTTP 失败边界，让调用方只按稳定 code/retryable/status 决策而不解析 message
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { enterpriseErrorStatuses } from './generated/enterprise-meta.gen.js'
import type { EnterpriseError, EnterpriseErrorCode } from './generated/types.gen.js'
import { zEnterpriseErrorResponse } from './generated/zod.gen.js'

export type { EnterpriseError, EnterpriseErrorCode }
export type EnterpriseErrorHttpStatus = typeof enterpriseErrorStatuses[EnterpriseErrorCode]

export function decodeEnterpriseError(value: unknown): EnterpriseError {
  return zEnterpriseErrorResponse.parse(value).error
}

export function enterpriseErrorHttpStatus(code: EnterpriseErrorCode): EnterpriseErrorHttpStatus {
  return enterpriseErrorStatuses[code]
}
