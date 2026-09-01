/**
 * [INPUT]: 由成员查询不存在、最后有效管理员或最后可用身份保护失败时构造。
 * [OUTPUT]: 提供 NOT_FOUND/LAST_ADMIN/LAST_IDENTITY 三种稳定成员治理失败。
 * [POS]: auth/application 的成员写入业务边界，避免把安全约束伪装成平台故障。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import java.util.Objects;

public final class MemberManagementException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final Kind kind;

    public MemberManagementException(Kind kind) {
        super(Objects.requireNonNull(kind, "kind").name(), null, false, false);
        this.kind = kind;
    }

    public static MemberManagementException notFound() {
        return new MemberManagementException(Kind.NOT_FOUND);
    }

    public Kind kind() {
        return kind;
    }

    public enum Kind { NOT_FOUND, LAST_ADMIN, LAST_IDENTITY }
}
