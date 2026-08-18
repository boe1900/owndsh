/**
 * [INPUT]: 用于无需附加白名单字段的审计 action。
 * [OUTPUT]: 对外提供序列化为 JSON object 的显式空 metadata DTO。
 * [POS]: audit metadata 的空对象实现，替代 null 或任意空 Map。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

/**
 * 无附加字段的审计 metadata。
 */
public record EmptyAuditMetadata() implements AuditMetadata {
}
