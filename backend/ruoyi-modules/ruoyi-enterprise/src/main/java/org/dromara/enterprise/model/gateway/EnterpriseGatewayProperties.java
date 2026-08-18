/**
 * [INPUT]: 依赖 enterprise.gateway 部署配置。
 * [OUTPUT]: 对外提供请求体与单个上游 SSE event 的正数 byte 上限。
 * [POS]: model/gateway 的资源边界配置，默认值对应详细设计的 10 MiB 请求限制。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise.gateway")
public class EnterpriseGatewayProperties {
    private int maxRequestBytes = 10 * 1024 * 1024;
    private int maxSseEventBytes = 1024 * 1024;

    public int getMaxRequestBytes() {
        return maxRequestBytes;
    }

    public void setMaxRequestBytes(int maxRequestBytes) {
        this.maxRequestBytes = requirePositive(maxRequestBytes, "max-request-bytes");
    }

    public int getMaxSseEventBytes() {
        return maxSseEventBytes;
    }

    public void setMaxSseEventBytes(int maxSseEventBytes) {
        this.maxSseEventBytes = requirePositive(maxSseEventBytes, "max-sse-event-bytes");
    }

    void validate() {
        requirePositive(maxRequestBytes, "max-request-bytes");
        requirePositive(maxSseEventBytes, "max-sse-event-bytes");
    }

    private static int requirePositive(int value, String name) {
        if (value <= 0) throw new IllegalArgumentException("enterprise.gateway." + name + " 必须为正数");
        return value;
    }
}
