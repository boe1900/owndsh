/**
 * [INPUT]: 投影 ModelProvider 的公开管理字段和 credentialConfigured 布尔事实。
 * [OUTPUT]: 对外提供不含 ciphertext、nonce、key version 或 credential 的 provider 响应 DTO。
 * [POS]: model/web 的 provider 输出防火墙，Controller 禁止直接序列化聚合根。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.domain.ProviderType;

import java.net.URI;

public record ProviderView(
    String id,
    String name,
    ProviderType providerType,
    URI baseUrl,
    boolean credentialConfigured,
    ModelStatus status,
    int connectTimeoutMs,
    int readTimeoutMs,
    long revision
) {
    public static ProviderView from(ModelProvider provider) {
        return new ProviderView(
            Long.toString(provider.id()), provider.name(), provider.providerType(), provider.baseUrl(),
            provider.credentialConfigured(), provider.status(), provider.connectTimeoutMs(),
            provider.readTimeoutMs(), provider.revision()
        );
    }
}
