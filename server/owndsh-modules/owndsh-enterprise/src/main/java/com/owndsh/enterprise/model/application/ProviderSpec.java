/**
 * [INPUT]: 接收不含 credential 的 Harness providerKey、来源类型、API 协议、显示名称、endpoint 与超时配置。
 * [OUTPUT]: 对外提供经过路由 ID、官方路由、协议和 origin/path 边界校验的 provider 写 command。
 * [POS]: model/application 的 provider 非秘密配置边界，探测与持久化共享同一 URL 规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.model.domain.ProviderType;

import java.net.URI;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

public record ProviderSpec(
    String providerKey,
    String name,
    ProviderType providerType,
    ProviderApiProtocol apiProtocol,
    URI baseUrl,
    int connectTimeoutMs,
    int readTimeoutMs
) {
    private static final Pattern PROVIDER_KEY = Pattern.compile("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");

    public ProviderSpec {
        Objects.requireNonNull(providerKey, "providerKey");
        if (providerKey.length() > 120 || !PROVIDER_KEY.matcher(providerKey).matches()) {
            throw new IllegalArgumentException("providerKey 非法");
        }
        Objects.requireNonNull(name, "name");
        if (name.isBlank() || name.length() > 120) throw new IllegalArgumentException("name 非法");
        Objects.requireNonNull(providerType, "providerType");
        Objects.requireNonNull(apiProtocol, "apiProtocol");
        boolean officialKey = "deepseek-official".equals(providerKey);
        if ((providerType == ProviderType.DEEPSEEK_OFFICIAL) != officialKey) {
            throw new IllegalArgumentException("DeepSeek 官方 providerKey 必须为 deepseek-official");
        }
        if (providerType == ProviderType.DEEPSEEK_OFFICIAL
            && apiProtocol != ProviderApiProtocol.OPENAI_COMPLETIONS) {
            throw new IllegalArgumentException("DeepSeek 官方只支持 openai-completions");
        }
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
