/**
 * [INPUT]: 聚合供应商连接的 endpoint、协议、模型发现路径、超时、加密凭据、状态与 revision。
 * [OUTPUT]: 对外提供模型路由所需的连接事实，并以 credentialConfigured 标识密钥是否存在。
 * [POS]: model/domain 的连接聚合；ModelProvider 只承载元信息。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.domain;

import com.owndsh.enterprise.crypto.EncryptedSecret;

import java.net.URI;
import java.util.Objects;

public record ProviderConnection(
    long id,
    String tenantId,
    long providerId,
    String providerName,
    String name,
    ProviderApiProtocol apiProtocol,
    URI baseUrl,
    String modelDiscoveryPath,
    EncryptedSecret encryptedCredential,
    ModelStatus status,
    int connectTimeoutMs,
    int readTimeoutMs,
    String lastProbeStatus,
    long revision
) {
    public ProviderConnection(long id, String tenantId, long providerId, String providerName, String name, ProviderApiProtocol apiProtocol, URI baseUrl, EncryptedSecret encryptedCredential, ModelStatus status, int connectTimeoutMs, int readTimeoutMs, String lastProbeStatus, long revision) {
        this(id, tenantId, providerId, providerName, name, apiProtocol, baseUrl, "/models", encryptedCredential, status, connectTimeoutMs, readTimeoutMs, lastProbeStatus, revision);
    }
    public ProviderConnection {
        if (id <= 0 || providerId <= 0) throw new IllegalArgumentException("connection/provider id 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        providerName = requireText(providerName, "providerName", 120);
        name = requireText(name, "name", 120);
        Objects.requireNonNull(apiProtocol, "apiProtocol");
        Objects.requireNonNull(baseUrl, "baseUrl");
        modelDiscoveryPath = requireDiscoveryPath(modelDiscoveryPath);
        Objects.requireNonNull(encryptedCredential, "encryptedCredential");
        Objects.requireNonNull(status, "status");
        if (connectTimeoutMs <= 0 || readTimeoutMs <= 0) throw new IllegalArgumentException("connection timeout 必须为正数");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public boolean credentialConfigured() { return true; }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }
    private static String requireDiscoveryPath(String value) {
        if (value == null || value.isBlank() || value.length() > 255 || !value.startsWith("/") || value.startsWith("//") || value.indexOf('?') >= 0 || value.indexOf('#') >= 0) throw new IllegalArgumentException("modelDiscoveryPath 非法");
        return value;
    }
}
