/**
 * [INPUT]: 接收不含 credential 的 provider 类型、名称、endpoint 与超时配置。
 * [OUTPUT]: 对外提供经过 origin/path 边界校验的 provider 写 command。
 * [POS]: model/application 的 provider 非秘密配置边界，探测与持久化共享同一 URL 规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.model.domain.ProviderType;

import java.net.URI;
import java.util.Locale;
import java.util.Objects;

public record ProviderSpec(
    String name,
    ProviderType providerType,
    URI baseUrl,
    int connectTimeoutMs,
    int readTimeoutMs
) {
    public ProviderSpec {
        Objects.requireNonNull(name, "name");
        if (name.isBlank() || name.length() > 120) throw new IllegalArgumentException("name 非法");
        Objects.requireNonNull(providerType, "providerType");
        baseUrl = requireEndpoint(baseUrl);
        requireTimeout(connectTimeoutMs, "connectTimeoutMs");
        requireTimeout(readTimeoutMs, "readTimeoutMs");
    }

    public static URI requireEndpoint(URI value) {
        Objects.requireNonNull(value, "baseUrl");
        String scheme = value.getScheme() == null ? "" : value.getScheme().toLowerCase(Locale.ROOT);
        if (!("https".equals(scheme) || "http".equals(scheme))
            || value.getHost() == null
            || value.getUserInfo() != null
            || value.getRawQuery() != null
            || value.getRawFragment() != null
            || value.toString().length() > 500) {
            throw new IllegalArgumentException("baseUrl 必须是固定 HTTP(S) endpoint");
        }
        return value.normalize();
    }

    private static void requireTimeout(int value, String name) {
        if (value < 1 || value > 600_000) throw new IllegalArgumentException(name + " 必须在 1..600000");
    }
}
