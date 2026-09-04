/**
 * [INPUT]: 绑定 enterprise.audit 的保留天数与批量大小
 * [OUTPUT]: 提供默认 365 天、每批 500 条的审计 retention 配置
 * [POS]: audit 环境配置边界，调度任务只消费经构造器复核的整数值
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise.audit")
public class EnterpriseAuditProperties {
    private int retentionDays = 365;
    private int retentionBatchSize = 500;

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
