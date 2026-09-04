/**
 * [INPUT]: 接收本地校验、平台 HTTP 与 Session 状态机失败事实
 * [OUTPUT]: 对外提供带稳定 code/retryable/httpStatus 的 SessionSyncError 与归一化函数
 * [POS]: session-sync 的唯一错误分类边界，worker 只依赖稳定事实决定退避或终止
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const TERMINAL_CODES = new Set([
  'ENT_SESSION_SEQ_GAP',
  'ENT_SESSION_DIVERGED',
  'ENT_SESSION_SOURCE_DEVICE_CONFLICT',
  'ENT_SESSION_FORMAT_UNSUPPORTED',
  'ENT_SESSION_CONTENT_EXPIRED',
  'ENT_SESSION_BATCH_TOO_LARGE',
])

/** 不携带响应正文、Session 内容或凭据的同步失败。 */
export class SessionSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SessionSyncError'
  }
}

function stringField(value: object, key: string): string | undefined {
  const field = Reflect.get(value, key)
  return typeof field === 'string' ? field : undefined
}

function numberField(value: object, key: string): number | undefined {
  const field = Reflect.get(value, key)
  return typeof field === 'number' ? field : undefined
}

function booleanField(value: object, key: string): boolean | undefined {
  const field = Reflect.get(value, key)
  return typeof field === 'boolean' ? field : undefined
}

/** 将 platform-client、fetch 和本地验证错误折叠为同步状态机事实。 */
export function sessionSyncError(error: unknown): SessionSyncError {
  if (error instanceof SessionSyncError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new SessionSyncError('ENT_PLATFORM_UNAVAILABLE', 'Session sync aborted', true, undefined, { cause: error })
  }
  if (typeof error === 'object' && error !== null) {
    const code = stringField(error, 'code')
    if (code !== undefined) {
      const status = numberField(error, 'httpStatus')
      const declaredRetryable = booleanField(error, 'retryable') === true
      const retryable = !TERMINAL_CODES.has(code) && (
        declaredRetryable
        || code === 'ENT_AUTH_REQUIRED'
        || code === 'ENT_AUTH_SESSION_EXPIRED'
        || code === 'ENT_PLATFORM_UNAVAILABLE'
        || (status !== undefined && status >= 500)
      )
      return new SessionSyncError(code, 'Enterprise Session request failed', retryable, status, { cause: error })
    }
  }
  return new SessionSyncError('ENT_PLATFORM_UNAVAILABLE', 'Session sync transport failed', true, undefined, {
    cause: error,
  })
}

export function isTerminalSessionCode(code: string): boolean {
  return TERMINAL_CODES.has(code)
}
