/**
 * [INPUT]: 投影 ModelProvider 的 Harness providerKey、来源类型、API 协议及 credentialConfigured 布尔事实。
 * [OUTPUT]: 对外提供不含 ciphertext、nonce、key version 或 credential 的 provider 响应 DTO。
 * [POS]: model/web 的 provider 输出防火墙，Controller 禁止直接序列化聚合根。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.domain.ModelProvider;
import com.owndsh.enterprise.model.domain.ModelStatus;
import com.owndsh.enterprise.model.domain.ProviderType;

import java.net.URI;

public record ProviderView(
    String id,
    String providerKey,
    String name,
    ProviderType providerType,
    String apiProtocol,
    URI baseUrl,
    boolean credentialConfigured,
    ModelStatus status,
    int connectTimeoutMs,
    int readTimeoutMs,
    long revision
) {
    public static ProviderView from(ModelProvider provider) {
        return new ProviderView(
            Long.toString(provider.id()), provider.providerKey(), provider.name(), provider.providerType(),
            provider.apiProtocol().value(), provider.baseUrl(),
            provider.credentialConfigured(), provider.status(), provider.connectTimeoutMs(),
            provider.readTimeoutMs(), provider.revision()
        );
    }
}
