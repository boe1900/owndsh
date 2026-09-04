/**
 * [INPUT]: 绑定 enterprise.http 的通用 JSON 请求体上限。
 * [OUTPUT]: 对外提供经正数验证的 maxJsonRequestBytes。
 * [POS]: common/api 的传输资源配置，模型流和 multipart 由各自专用边界管理。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise.http")
public final class EnterpriseHttpProperties {
    private int maxJsonRequestBytes = 2 * 1024 * 1024;

    public int getMaxJsonRequestBytes() {
        return maxJsonRequestBytes;
    }

    public void setMaxJsonRequestBytes(int maxJsonRequestBytes) {
        if (maxJsonRequestBytes <= 0) {
            throw new IllegalArgumentException("enterprise.http.max-json-request-bytes 必须为正数");
        }
        this.maxJsonRequestBytes = maxJsonRequestBytes;
    }
}
