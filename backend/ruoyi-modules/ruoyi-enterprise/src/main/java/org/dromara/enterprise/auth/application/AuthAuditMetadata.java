/**
 * [INPUT]: 接收固定平台 client 与公开身份源类型。
 * [OUTPUT]: 对外提供 LOGIN_SUCCEEDED/LOGIN_FAILED/LOGOUT 的白名单审计 metadata。
 * [POS]: auth application 的审计脱敏 DTO，不记录 state、code、verifier、用户名或 redirect URI。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.audit.AuditMetadata;
import org.dromara.enterprise.auth.domain.IdentitySourceType;

public record AuthAuditMetadata(String clientId, IdentitySourceType sourceType) implements AuditMetadata {
}
