/**
 * [INPUT]: 绑定 enterprise.quota.deployment-time-zone 环境映射。
 * [OUTPUT]: 对外提供启动时要求的 IANA Zone ID 字符串。
 * [POS]: quota 模块部署配置边界，数据库 V6 负责首次写入后冻结。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise.quota")
public final class EnterpriseQuotaProperties {
    private String deploymentTimeZone = "Asia/Shanghai";

    public String getDeploymentTimeZone() {
        return deploymentTimeZone;
    }

    public void setDeploymentTimeZone(String deploymentTimeZone) {
        this.deploymentTimeZone = deploymentTimeZone;
    }
}
