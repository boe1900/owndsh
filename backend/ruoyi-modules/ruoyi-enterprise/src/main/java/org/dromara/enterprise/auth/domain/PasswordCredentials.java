/**
 * [INPUT]: 接收一次 LOCAL/LDAP 认证的用户名、当前密码与可选 LOCAL 首次改密字符。
 * [OUTPUT]: 对外提供防御性复制、显式 close 全量清零且永不打印密码的 PasswordCredentials。
 * [POS]: 密码身份适配器的一次性凭据容器，首次改密只被 LOCAL 消费且生命周期不越过 authenticate。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.util.Arrays;
import java.util.Objects;

/**
 * 一次性用户名密码凭据。
 */
public final class PasswordCredentials implements IdentityCredential, AutoCloseable {
    private final String username;
    private final char[] password;
    private final char[] newPassword;

    public PasswordCredentials(String username, char[] password) {
        this(username, password, null);
    }

    public PasswordCredentials(String username, char[] password, char[] newPassword) {
        this.username = Objects.requireNonNull(username, "username");
        if (username.isBlank()) {
            throw new IllegalArgumentException("username 不能为空");
        }
        this.password = Objects.requireNonNull(password, "password").clone();
        if (password.length == 0) {
            throw new IllegalArgumentException("password 不能为空");
        }
        this.newPassword = newPassword == null ? null : newPassword.clone();
        if (this.newPassword != null && this.newPassword.length == 0) {
            throw new IllegalArgumentException("newPassword 不能为空");
        }
    }

    public String username() {
        return username;
    }

    public char[] password() {
        return password.clone();
    }

    public char[] newPassword() {
        return newPassword == null ? null : newPassword.clone();
    }

    @Override
    public void close() {
        Arrays.fill(password, '\0');
        if (newPassword != null) Arrays.fill(newPassword, '\0');
    }

    @Override
    public String toString() {
        return "PasswordCredentials[username=" + username + ", password=[REDACTED], newPassword=[REDACTED]]";
    }
}
