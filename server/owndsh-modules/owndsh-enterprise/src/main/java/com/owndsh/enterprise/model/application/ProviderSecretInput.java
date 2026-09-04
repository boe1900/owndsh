/**
 * [INPUT]: 接收 provider credential 的短生命周期字符数组。
 * [OUTPUT]: 对外提供防御性复制、显式清零和脱敏字符串表示。
 * [POS]: model/application 的秘密写入边界，禁止 credential 进入 spec、响应或审计 metadata。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import java.util.Arrays;
import java.util.Objects;

public final class ProviderSecretInput implements AutoCloseable {
    private final char[] value;

    public ProviderSecretInput(char[] value) {
        Objects.requireNonNull(value, "value");
        if (value.length == 0 || value.length > 4096) {
            throw new IllegalArgumentException("credential 长度非法");
        }
        this.value = value.clone();
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
        return "ProviderSecretInput[value=[REDACTED]]";
    }
}
