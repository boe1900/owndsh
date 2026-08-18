/**
 * [INPUT]: 接收管理 API 中一次性 client secret 或 LDAP manager password 字符。
 * [OUTPUT]: 对外提供防御性复制、显式清零和完全脱敏字符串表示的 SecretInput。
 * [POS]: identity application 的秘密写入边界，不能进入响应、审计 metadata 或持久化 JSON。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import java.util.Arrays;
import java.util.Objects;

/**
 * 一次性身份源秘密。
 */
public final class SecretInput implements AutoCloseable {
    private final char[] value;

    public SecretInput(char[] value) {
        this.value = Objects.requireNonNull(value, "value").clone();
        if (value.length == 0) {
            throw new IllegalArgumentException("secret 不能为空");
        }
    }

    public char[] value() {
        return value.clone();
    }

    @Override
    public void close() {
        Arrays.fill(value, '\0');
    }

    @Override
    public String toString() {
        return "SecretInput[value=[REDACTED]]";
    }
}
