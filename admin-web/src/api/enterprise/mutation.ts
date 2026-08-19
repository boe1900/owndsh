/**
 * [INPUT]: 依赖浏览器 Web Crypto UUID v4 与服务端 Idempotency-Key/If-Match 约束
 * [OUTPUT]: 提供企业配置创建和 revision CAS 请求头
 * [POS]: api/enterprise 的并发协议小工具，业务页面不得自行拼接 mutation headers
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function idempotencyHeaders() {
  return {
    'Idempotency-Key': crypto.randomUUID(),
    repeatSubmit: false as const
  };
}

export function revisionHeaders(revision: number) {
  return {
    'If-Match': String(revision),
    repeatSubmit: false as const
  };
}
