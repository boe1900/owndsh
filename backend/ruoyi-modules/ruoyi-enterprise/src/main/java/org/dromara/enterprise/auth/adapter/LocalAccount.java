/**
 * [INPUT]: 由 LocalAccountStore 从 sys_user 投影登录与首次改密所需最小字段。
 * [OUTPUT]: 对外提供包含不可序列化密码 hash 和改密标记的内部 LocalAccount。
 * [POS]: LOCAL adapter 的持久化投影，不作为 Controller DTO 或审计 metadata。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import java.util.Objects;

/**
 * RuoYi 本地账号最小投影。
 */
public final class LocalAccount {
    private final long userId;
    private final String username;
    private final String displayName;
    private final String email;
    private final String passwordHash;
    private final boolean enabled;
    private final boolean passwordChangeRequired;

    public LocalAccount(
        long userId,
        String username,
        String displayName,
        String email,
        String passwordHash,
        boolean enabled
    ) {
        this(userId, username, displayName, email, passwordHash, enabled, false);
    }

    public LocalAccount(
        long userId,
        String username,
        String displayName,
        String email,
        String passwordHash,
        boolean enabled,
        boolean passwordChangeRequired
    ) {
        this.userId = userId;
        this.username = Objects.requireNonNull(username, "username");
        this.displayName = Objects.requireNonNull(displayName, "displayName");
        this.email = email;
        this.passwordHash = Objects.requireNonNull(passwordHash, "passwordHash");
        this.enabled = enabled;
        this.passwordChangeRequired = passwordChangeRequired;
    }

    public long userId() {
        return userId;
    }

    public String username() {
        return username;
    }

    public String displayName() {
        return displayName;
    }

    public String email() {
        return email;
    }

    public String passwordHash() {
        return passwordHash;
    }

    public boolean enabled() {
        return enabled;
    }

    public boolean passwordChangeRequired() {
        return passwordChangeRequired;
    }

    @Override
    public String toString() {
        return "LocalAccount[userId=" + userId + ", username=" + username + ", passwordHash=[REDACTED]]";
    }
}
