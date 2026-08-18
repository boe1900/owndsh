/**
 * [INPUT]: 接收一次 LOCAL/LDAP 认证的用户名和可清零密码字符。
 * [OUTPUT]: 对外提供防御性复制、显式 close 清零且永不打印密码的 PasswordCredentials。
 * [POS]: 密码身份适配器的一次性凭据容器，生命周期不得越过单次 authenticate 调用。
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

    public PasswordCredentials(String username, char[] password) {
        this.username = Objects.requireNonNull(username, "username");
        if (username.isBlank()) {
            throw new IllegalArgumentException("username 不能为空");
        }
        this.password = Objects.requireNonNull(password, "password").clone();
        if (password.length == 0) {
            throw new IllegalArgumentException("password 不能为空");
        }
    }

    public String username() {
        return username;
    }

    public char[] password() {
        return password.clone();
    }

    @Override
    public void close() {
        Arrays.fill(password, '\0');
    }

    @Override
    public String toString() {
        return "PasswordCredentials[username=" + username + ", password=[REDACTED]]";
    }
}
