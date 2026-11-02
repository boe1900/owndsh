/**
 * [INPUT]: 接收未保存模型接入的协议、endpoint、模型发现路径与超时配置。
 * [OUTPUT]: 提供经过统一 endpoint/路径/超时校验的模型探测规格。
 * [POS]: model/application 的草稿探测 command，与持久化连接写入规格保持边界分离。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;

import java.net.URI;
import java.util.Objects;

public record ProviderProbeSpec(
    ProviderApiProtocol apiProtocol,
    URI baseUrl,
    String modelDiscoveryPath,
    int connectTimeoutMs,
    int readTimeoutMs
) {
    public ProviderProbeSpec {
        Objects.requireNonNull(apiProtocol, "apiProtocol");
        baseUrl = ProviderConnectionSpec.requireEndpoint(baseUrl);
        modelDiscoveryPath = ProviderConnectionSpec.requireDiscoveryPath(
            modelDiscoveryPath == null ? "/models" : modelDiscoveryPath
        );
        if (connectTimeoutMs < 1 || connectTimeoutMs > 600000
            || readTimeoutMs < 1 || readTimeoutMs > 600000) {
            throw new IllegalArgumentException("connection timeout 非法");
        }
    }
}
