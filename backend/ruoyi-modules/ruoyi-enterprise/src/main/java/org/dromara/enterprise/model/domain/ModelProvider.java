/**
 * [INPUT]: 聚合 Harness providerKey、来源类型、API 协议、endpoint、超时、状态、revision 与 AES-GCM 密文。
 * [OUTPUT]: 对外提供持久化无关 ModelProvider 聚合和 credentialConfigured 事实。
 * [POS]: model/domain 的 provider 聚合根，Web 必须经 ProviderView 隔离密文字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import org.dromara.enterprise.crypto.EncryptedSecret;

import java.net.URI;
import java.util.Objects;
import java.util.regex.Pattern;

public record ModelProvider(
    long id,
    String tenantId,
    String providerKey,
    String name,
    ProviderType providerType,
    ProviderApiProtocol apiProtocol,
    URI baseUrl,
    EncryptedSecret encryptedCredential,
    ModelStatus status,
    int connectTimeoutMs,
    int readTimeoutMs,
    long revision
) {
    private static final Pattern PROVIDER_KEY = Pattern.compile("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");

    public ModelProvider {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        providerKey = requireText(providerKey, "providerKey", 120);
        if (!PROVIDER_KEY.matcher(providerKey).matches()) throw new IllegalArgumentException("providerKey 非法");
        name = requireText(name, "name", 120);
        Objects.requireNonNull(providerType, "providerType");
        Objects.requireNonNull(apiProtocol, "apiProtocol");
        Objects.requireNonNull(baseUrl, "baseUrl");
        Objects.requireNonNull(encryptedCredential, "encryptedCredential");
        Objects.requireNonNull(status, "status");
        if (connectTimeoutMs <= 0 || readTimeoutMs <= 0) {
            throw new IllegalArgumentException("provider timeout 必须为正数");
        }
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public boolean credentialConfigured() {
        return true;
    }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }
}
