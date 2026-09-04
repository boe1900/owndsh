/**
 * [INPUT]: 接收 Harness providerKey、来源类型、API 协议、显示名称、endpoint、replaceSecret 与一次性 char[] credential。
 * [OUTPUT]: 对外提供 ProviderSpec、创建/更新 ProviderSecretInput、显式清零和脱敏 toString。
 * [POS]: model/web 的 provider 写边界，credential 不转换为领域配置或日志友好字符串。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.application.ProviderSecretInput;
import org.dromara.enterprise.model.application.ProviderSpec;
import org.dromara.enterprise.model.domain.ProviderApiProtocol;
import org.dromara.enterprise.model.domain.ProviderType;

import java.net.URI;
import java.util.Arrays;

public record ProviderWriteRequest(
    String providerKey,
    String name,
    ProviderType providerType,
    String apiProtocol,
    URI baseUrl,
    Boolean replaceSecret,
    char[] credential,
    int connectTimeoutMs,
    int readTimeoutMs
) implements AutoCloseable {
    public ProviderWriteRequest {
        credential = credential == null ? null : credential.clone();
    }

    @Override
    public char[] credential() {
        return credential == null ? null : credential.clone();
    }

    public ProviderSpec spec() {
        return new ProviderSpec(
            providerKey, name, providerType, ProviderApiProtocol.fromValue(apiProtocol),
            baseUrl, connectTimeoutMs, readTimeoutMs
        );
    }

    public ProviderSecretInput createCredential() {
        if (replaceSecret != null) throw new IllegalArgumentException("创建 provider 不能提交 replaceSecret");
        if (credential == null) throw new IllegalArgumentException("credential 不能为空");
        return new ProviderSecretInput(credential);
    }

    public ProviderSecretInput replacementCredential() {
        boolean replacementRequested = replacementRequested();
        if (!replacementRequested) {
            if (credential != null) throw new IllegalArgumentException("replaceSecret=false 时不能提交 credential");
            return null;
        }
        if (credential == null) throw new IllegalArgumentException("replaceSecret=true 时 credential 必填");
        return new ProviderSecretInput(credential);
    }

    public boolean replacementRequested() {
        if (replaceSecret == null) throw new IllegalArgumentException("更新 provider 必须提交 replaceSecret");
        return replaceSecret;
    }

    @Override
    public void close() {
        if (credential != null) Arrays.fill(credential, '\0');
    }

    @Override
    public String toString() {
        return "ProviderWriteRequest[credential=[REDACTED]]";
    }
}
