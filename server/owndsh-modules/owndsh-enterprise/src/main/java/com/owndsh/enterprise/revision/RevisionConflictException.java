/**
 * [INPUT]: 由 revision CAS 受影响行数为零时提供 expected 与数据库 current 值。
 * [OUTPUT]: 对外提供稳定错误码 ENT_REVISION_CONFLICT 的领域异常。
 * [POS]: revision 并发冲突到 HTTP 错误映射的领域边界，不把冲突伪装为数据库故障。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.revision;

/**
 * optimistic revision 冲突。
 */
public final class RevisionConflictException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_REVISION_CONFLICT";
    private static final long serialVersionUID = 1L;

    private final long expectedRevision;
    private final long currentRevision;

    public RevisionConflictException(long expectedRevision, long currentRevision) {
        super("revision 冲突");
        this.expectedRevision = expectedRevision;
        this.currentRevision = currentRevision;
    }

    public String errorCode() {
        return ERROR_CODE;
    }

    public long expectedRevision() {
        return expectedRevision;
    }

    public long currentRevision() {
        return currentRevision;
    }
}
