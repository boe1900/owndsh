/**
 * [INPUT]: 接收网关可公开的封闭失败分类。
 * [OUTPUT]: 对外提供稳定 code 且关闭 stack trace 的领域异常。
 * [POS]: model/gateway 到统一 HTTP/SSE 错误边界的脱敏契约，不接收上游正文、URL 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import java.util.Objects;

public final class GatewayException extends RuntimeException {
    private final Kind kind;

    public GatewayException(Kind kind) {
        this(kind, null);
    }

    GatewayException(Kind kind, Throwable cause) {
        super(Objects.requireNonNull(kind, "kind").code(), cause, false, false);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    public String code() {
        return kind.code();
    }

    public enum Kind {
        MODEL_NOT_ASSIGNED("ENT_MODEL_NOT_ASSIGNED"),
        REQUEST_TOO_LARGE("ENT_REQUEST_TOO_LARGE"),
        UPSTREAM_AUTH_FAILED("ENT_UPSTREAM_AUTH_FAILED"),
        UPSTREAM_INVALID_RESPONSE("ENT_UPSTREAM_INVALID_RESPONSE"),
        PLATFORM_UNAVAILABLE("ENT_PLATFORM_UNAVAILABLE"),
        UPSTREAM_UNAVAILABLE("ENT_UPSTREAM_UNAVAILABLE"),
        UPSTREAM_TIMEOUT("ENT_UPSTREAM_TIMEOUT");

        private final String code;

        Kind(String code) {
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
