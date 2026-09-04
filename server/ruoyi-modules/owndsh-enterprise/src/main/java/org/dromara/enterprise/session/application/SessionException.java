/**
 * [INPUT]: 表达 Session 服务端可预期的格式、容量、序列、设备、所有权与 tombstone 失败。
 * [OUTPUT]: 对外提供封闭 Kind 与详细设计第 17 节稳定错误码。
 * [POS]: session application 到统一异常处理器的错误边界，不携带正文、SQL 或内部异常。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session.application;

public final class SessionException extends RuntimeException {
    private final Kind kind;

    public SessionException(Kind kind) {
        super(kind.name());
        this.kind = java.util.Objects.requireNonNull(kind, "kind");
    }

    public Kind kind() {
        return kind;
    }

    public String errorCode() {
        return kind.errorCode;
    }

    public enum Kind {
        FORMAT_UNSUPPORTED("ENT_SESSION_FORMAT_UNSUPPORTED"),
        BATCH_TOO_LARGE("ENT_SESSION_BATCH_TOO_LARGE"),
        SEQ_GAP("ENT_SESSION_SEQ_GAP"),
        DIVERGED("ENT_SESSION_DIVERGED"),
        SOURCE_DEVICE_CONFLICT("ENT_SESSION_SOURCE_DEVICE_CONFLICT"),
        CONTENT_EXPIRED("ENT_SESSION_CONTENT_EXPIRED"),
        NOT_FOUND("ENT_RESOURCE_NOT_FOUND");

        private final String errorCode;

        Kind(String errorCode) {
            this.errorCode = errorCode;
        }

        public String errorCode() {
            return errorCode;
        }
    }
}
