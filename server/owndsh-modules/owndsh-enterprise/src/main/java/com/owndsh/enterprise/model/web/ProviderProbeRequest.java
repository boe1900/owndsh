/**
 * [INPUT]: 接收未保存连接的协议、endpoint、模型发现路径、超时与一次性 credential。
 * [OUTPUT]: 提供草稿探测规格和短生命周期秘密，禁止请求正文进入业务日志。
 * [POS]: model/web 的模型发现请求边界，不复用持久化连接写入 DTO。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ProviderProbeSpec;
import com.owndsh.enterprise.model.application.ProviderSecretInput;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;

import java.net.URI;
import java.util.Arrays;

public record ProviderProbeRequest(
    String apiProtocol,
    URI baseUrl,
    String modelDiscoveryPath,
    char[] credential,
    int connectTimeoutMs,
    int readTimeoutMs
) implements AutoCloseable {
    public ProviderProbeRequest {
        credential = credential == null ? null : credential.clone();
    }

    public ProviderProbeSpec spec() {
        return new ProviderProbeSpec(
            ProviderApiProtocol.fromValue(apiProtocol),
            baseUrl,
            modelDiscoveryPath,
            connectTimeoutMs,
            readTimeoutMs
        );
    }

    public ProviderSecretInput createSecret() {
        if (credential == null) throw new IllegalArgumentException("credential 不能为空");
        return new ProviderSecretInput(credential);
    }

    @Override
    public void close() {
        if (credential != null) Arrays.fill(credential, '\0');
    }

    @Override
    public String toString() {
        return "ProviderProbeRequest[credential=[REDACTED]]";
    }
}
