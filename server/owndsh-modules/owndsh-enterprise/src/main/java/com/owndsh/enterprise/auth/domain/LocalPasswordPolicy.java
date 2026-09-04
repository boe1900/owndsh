/**
 * [INPUT]: 接收 LOCAL 用户名与仅驻留当前调用的候选密码字符。
 * [OUTPUT]: 提供 bootstrap 和首次改密共享的长度、字符类别、空白与用户名隔离校验。
 * [POS]: auth/domain 的单一 LOCAL 密码策略真源，避免部署初始化与认证更新出现规则漂移。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.util.Locale;
import java.util.Objects;

public final class LocalPasswordPolicy {
    public static final int MIN_LENGTH = 14;
    public static final int MAX_LENGTH = 128;

    private LocalPasswordPolicy() {
    }

    public static void validate(String username, char[] password) {
        Objects.requireNonNull(username, "username");
        Objects.requireNonNull(password, "password");
        boolean lower = false;
        boolean upper = false;
        boolean digit = false;
        boolean symbol = false;
        for (char value : password) {
            if (Character.isWhitespace(value) || Character.isISOControl(value)) {
                throw new IllegalArgumentException("LOCAL 密码不能包含空白或控制字符");
            }
            lower |= Character.isLowerCase(value);
            upper |= Character.isUpperCase(value);
            digit |= Character.isDigit(value);
            symbol |= !Character.isLetterOrDigit(value);
        }
        if (password.length < MIN_LENGTH || password.length > MAX_LENGTH || !lower || !upper || !digit || !symbol) {
            throw new IllegalArgumentException("LOCAL 密码必须为 14-128 位并包含大小写字母、数字和符号");
        }
        String passwordText = new String(password).toLowerCase(Locale.ROOT);
        if (username.length() >= 3 && passwordText.contains(username.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("LOCAL 密码不能包含用户名");
        }
    }
}
