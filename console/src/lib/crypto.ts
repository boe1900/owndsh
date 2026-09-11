/**
 * [INPUT]: 依赖 HTTP 与 HTTPS 均可用的浏览器 crypto.getRandomValues。
 * [OUTPUT]: 提供使用密码学随机数的 UUID v4 幂等键生成器 randomUuid。
 * [POS]: 控制台写操作的共享随机标识边界，避免普通 HTTP 域名依赖仅安全上下文可用的 randomUUID。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
