/**
 * [INPUT]: 接收网关可公开的失败分类与仅供服务端日志使用的封闭诊断事实。
 * [OUTPUT]: 对外提供稳定 code，并在关闭 stack trace 的同时保留脱敏失败阶段、HTTP 状态和 request ID。
 * [POS]: model/gateway 到统一 HTTP/SSE 错误边界的脱敏契约，禁止接收上游正文、URL 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import java.util.Objects;

public final class GatewayException extends RuntimeException {
    private final Kind kind;
    private final Detail detail;
    private final Integer upstreamStatus;
    private final String upstreamRequestId;

    public GatewayException(Kind kind) {
        this(kind, Detail.UNCLASSIFIED, null, null, null);
    }

    GatewayException(Kind kind, Throwable cause) {
        this(kind, Detail.UNCLASSIFIED, null, null, cause);
    }

    GatewayException(Kind kind, Detail detail) {
        this(kind, detail, null, null, null);
    }

    GatewayException(Kind kind, Detail detail, Integer upstreamStatus, String upstreamRequestId) {
        this(kind, detail, upstreamStatus, upstreamRequestId, null);
    }

    private GatewayException(
        Kind kind,
        Detail detail,
        Integer upstreamStatus,
        String upstreamRequestId,
        Throwable cause
    ) {
        super(Objects.requireNonNull(kind, "kind").code(), cause, false, false);
        this.kind = kind;
        this.detail = Objects.requireNonNull(detail, "detail");
        this.upstreamStatus = upstreamStatus;
        this.upstreamRequestId = upstreamRequestId;
    }

    public Kind kind() {
        return kind;
    }

    public String code() {
        return kind.code();
    }

    Detail detail() {
        return detail;
    }

    Integer upstreamStatus() {
        return upstreamStatus;
    }

    String upstreamRequestId() {
        return upstreamRequestId;
    }

    enum Detail {
        UNCLASSIFIED,
        HTTP_STATUS,
        NON_SSE_CONTENT_TYPE,
        CLOSED_EXCHANGE,
        EMPTY_STREAM,
        PREMATURE_EOF,
        EVENT_TOO_LARGE,
        INVALID_EVENT,
        UPSTREAM_ERROR_EVENT,
        INVALID_USAGE
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
