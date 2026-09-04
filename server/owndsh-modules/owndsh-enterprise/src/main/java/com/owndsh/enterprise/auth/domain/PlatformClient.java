/**
 * [INPUT]: 接收协议固定的 client_id，并依赖部署配置的管理端精确 redirect URI。
 * [OUTPUT]: 对外提供 dsh-desktop/enterprise-admin 参数集合、redirect allowlist 与终端类型不变量。
 * [POS]: auth 领域的固定 public client 真源，拒绝动态注册和两类客户端参数混用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.net.URI;
import java.util.Objects;
import java.util.UUID;

/**
 * 平台固定 public client。
 */
public enum PlatformClient {
    DSH_DESKTOP("dsh-desktop", "harness"),
    ENTERPRISE_ADMIN("enterprise-admin", "console");

    private final String clientId;
    private final String deviceType;

    PlatformClient(String clientId, String deviceType) {
        this.clientId = clientId;
        this.deviceType = deviceType;
    }

    public String clientId() {
        return clientId;
    }

    public String deviceType() {
        return deviceType;
    }

    public static PlatformClient parse(String value) {
        for (PlatformClient client : values()) {
            if (client.clientId.equals(value)) return client;
        }
        throw new IllegalArgumentException("未知平台 client_id");
    }

    public void validate(URI redirectUri, UUID installationId, URI adminRedirectUri) {
        Objects.requireNonNull(redirectUri, "redirectUri");
        switch (this) {
            case DSH_DESKTOP -> {
                if (installationId == null || installationId.version() != 4 || !isLoopbackCallback(redirectUri)) {
                    throw new IllegalArgumentException("dsh-desktop 参数非法");
                }
            }
            case ENTERPRISE_ADMIN -> {
                if (installationId != null || !redirectUri.equals(adminRedirectUri)) {
                    throw new IllegalArgumentException("enterprise-admin 参数非法");
                }
            }
        }
    }

    private static boolean isLoopbackCallback(URI uri) {
        return "http".equals(uri.getScheme())
            && "127.0.0.1".equals(uri.getHost())
            && uri.getPort() >= 1024
            && uri.getPort() <= 65535
            && uri.getUserInfo() == null
            && uri.getRawAuthority().equals("127.0.0.1:" + uri.getPort())
            && "/callback".equals(uri.getRawPath())
            && uri.getRawQuery() == null
            && uri.getRawFragment() == null;
    }
}
