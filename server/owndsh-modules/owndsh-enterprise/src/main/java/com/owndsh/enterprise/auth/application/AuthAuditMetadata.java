/**
 * [INPUT]: 接收固定平台 client 与公开身份源类型。
 * [OUTPUT]: 对外提供 LOGIN_SUCCEEDED/LOGIN_FAILED/LOGOUT 的白名单审计 metadata。
 * [POS]: auth application 的审计脱敏 DTO，不记录 state、code、verifier、用户名或 redirect URI。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;

import java.util.Objects;

public sealed interface AuthAuditMetadata extends AuditMetadata permits
    AuthAuditMetadata.LoginSucceeded,
    AuthAuditMetadata.LoginFailed,
    AuthAuditMetadata.Logout {

    record LoginSucceeded(String clientId, IdentitySourceType sourceType) implements AuthAuditMetadata {
        public LoginSucceeded {
            requireClient(clientId);
            Objects.requireNonNull(sourceType, "sourceType");
        }

        @Override
        public AuditAction action() {
            return AuditAction.LOGIN_SUCCEEDED;
        }
    }

    record LoginFailed(String clientId, IdentitySourceType sourceType) implements AuthAuditMetadata {
        public LoginFailed {
            requireClient(clientId);
            Objects.requireNonNull(sourceType, "sourceType");
        }

        @Override
        public AuditAction action() {
            return AuditAction.LOGIN_FAILED;
        }
    }

    record Logout(String clientId) implements AuthAuditMetadata {
        public Logout {
            requireClient(clientId);
        }

        @Override
        public AuditAction action() {
            return AuditAction.LOGOUT;
        }
    }

    private static void requireClient(String clientId) {
        if (clientId == null || clientId.isBlank()) throw new IllegalArgumentException("clientId 不能为空");
    }
}
