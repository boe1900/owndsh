/**
 * [INPUT]: 由 LOCAL adapter 在账号无本地密码、当前密码错误或新密码不合规时抛出。
 * [OUTPUT]: 向认证编排和产品 API 提供不携带账号、密码或 hash 的分类改密拒绝信号。
 * [POS]: auth/adapter 的受限失败边界，首次改密轮换 challenge，常规改密映射为安全产品错误。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.adapter;

public final class LocalPasswordChangeRejectedException extends RuntimeException {
    private final Kind kind;

    public LocalPasswordChangeRejectedException() {
        this(Kind.NEW_PASSWORD_REJECTED);
    }

    private LocalPasswordChangeRejectedException(Kind kind) {
        super(kind.name(), null, false, false);
        this.kind = kind;
    }

    public static LocalPasswordChangeRejectedException currentPasswordInvalid() {
        return new LocalPasswordChangeRejectedException(Kind.CURRENT_PASSWORD_INVALID);
    }

    public static LocalPasswordChangeRejectedException localPasswordUnavailable() {
        return new LocalPasswordChangeRejectedException(Kind.LOCAL_PASSWORD_UNAVAILABLE);
    }

    public Kind kind() {
        return kind;
    }

    public enum Kind { NEW_PASSWORD_REJECTED, CURRENT_PASSWORD_INVALID, LOCAL_PASSWORD_UNAVAILABLE }
}
