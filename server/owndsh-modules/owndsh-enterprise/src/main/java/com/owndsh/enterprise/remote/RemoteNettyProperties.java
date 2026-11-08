/**
 * [INPUT]: 依赖 enterprise.remote.* 运行配置和 TLS 文件路径。
 * [OUTPUT]: 提供经校验的 Remote listener 配置，避免运行时散落魔法数字。
 * [POS]: remote 的配置边界，所有外部值在此处收敛后再进入 Netty。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "enterprise.remote")
public class RemoteNettyProperties {
    private boolean enabled;
    private String bindAddress = "0.0.0.0";
    private int port = 8090;
    private int maxFrameBytes = RemoteProtocol.MAX_FRAME_BYTES;
    private boolean tlsEnabled;
    private Path certificate;
    private Path privateKey;
    private String allowedOrigin = "";
    private List<String> iceServerUrls = new ArrayList<>();
    private String turnSharedSecret = "";
    private int turnCredentialTtlSeconds = 60;

    public void validate() {
        if (bindAddress == null || bindAddress.isBlank()) throw new IllegalArgumentException("enterprise.remote.bind-address is required");
        if (port < 1 || port > 65535) throw new IllegalArgumentException("enterprise.remote.port must be 1..65535");
        if (maxFrameBytes < 1024 || maxFrameBytes > RemoteProtocol.MAX_FRAME_BYTES) throw new IllegalArgumentException("enterprise.remote.max-frame-bytes is invalid");
        if (tlsEnabled && (certificate == null || privateKey == null)) throw new IllegalArgumentException("TLS certificate and private key are required");
        if (turnCredentialTtlSeconds < 30 || turnCredentialTtlSeconds > 3600) throw new IllegalArgumentException("enterprise.remote.turn-credential-ttl-seconds is invalid");
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBindAddress() { return bindAddress; }
    public void setBindAddress(String bindAddress) { this.bindAddress = bindAddress; }
    public int getPort() { return port; }
    public void setPort(int port) { this.port = port; }
    public int getMaxFrameBytes() { return maxFrameBytes; }
    public void setMaxFrameBytes(int maxFrameBytes) { this.maxFrameBytes = maxFrameBytes; }
    public boolean isTlsEnabled() { return tlsEnabled; }
    public void setTlsEnabled(boolean tlsEnabled) { this.tlsEnabled = tlsEnabled; }
    public Path getCertificate() { return certificate; }
    public void setCertificate(Path certificate) { this.certificate = certificate; }
    public Path getPrivateKey() { return privateKey; }
    public void setPrivateKey(Path privateKey) { this.privateKey = privateKey; }
    public String getAllowedOrigin() { return allowedOrigin; }
    public void setAllowedOrigin(String allowedOrigin) { this.allowedOrigin = allowedOrigin; }
    public List<String> getIceServerUrls() { return List.copyOf(iceServerUrls); }
    public void setIceServerUrls(List<String> iceServerUrls) { this.iceServerUrls = iceServerUrls == null ? List.of() : new ArrayList<>(iceServerUrls); }
    public String getTurnSharedSecret() { return turnSharedSecret; }
    public void setTurnSharedSecret(String turnSharedSecret) { this.turnSharedSecret = turnSharedSecret == null ? "" : turnSharedSecret; }
    public int getTurnCredentialTtlSeconds() { return turnCredentialTtlSeconds; }
    public void setTurnCredentialTtlSeconds(int turnCredentialTtlSeconds) { this.turnCredentialTtlSeconds = turnCredentialTtlSeconds; }
}
