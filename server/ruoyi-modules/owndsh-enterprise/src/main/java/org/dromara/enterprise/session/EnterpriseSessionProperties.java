/**
 * [INPUT]: 绑定 enterprise.session 的批次容量与 retention 部署参数。
 * [OUTPUT]: 对外提供带安全默认值的 Session Server 配置。
 * [POS]: session 模块的环境配置边界，业务层只消费已验证的字节数与时间范围。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise.session")
public class EnterpriseSessionProperties {
    private int maxBatchBytes = 1024 * 1024;
    private int retentionDays = 90;
    private int retentionBatchSize = 100;

    public int getMaxBatchBytes() {
        return maxBatchBytes;
    }

    public void setMaxBatchBytes(int maxBatchBytes) {
        this.maxBatchBytes = maxBatchBytes;
    }

    public int getRetentionDays() {
        return retentionDays;
    }

    public void setRetentionDays(int retentionDays) {
        this.retentionDays = retentionDays;
    }

    public int getRetentionBatchSize() {
        return retentionBatchSize;
    }

    public void setRetentionBatchSize(int retentionBatchSize) {
        this.retentionBatchSize = retentionBatchSize;
    }
}
