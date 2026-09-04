/**
 * [INPUT]: 接收未保存 baseUrl/timeouts 与可选一次性新 credential。
 * [OUTPUT]: 对外提供短生命周期 ProviderSecretInput、清零和脱敏字符串表示。
 * [POS]: model/web 的 provider test 请求边界，允许表单草稿探测且不回显请求秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ProviderSecretInput;

import java.net.URI;
import java.util.Arrays;

public record ProviderTestRequest(
    URI baseUrl,
    char[] credential,
    int connectTimeoutMs,
    int readTimeoutMs
) implements AutoCloseable {
    public ProviderTestRequest {
        credential = credential == null ? null : credential.clone();
    }

    @Override
    public char[] credential() {
        return credential == null ? null : credential.clone();
    }

    public ProviderSecretInput credentialInput() {
        return credential == null ? null : new ProviderSecretInput(credential);
    }

    @Override
    public void close() {
        if (credential != null) Arrays.fill(credential, '\0');
    }

    @Override
    public String toString() {
        return "ProviderTestRequest[credential=[REDACTED]]";
    }
}
