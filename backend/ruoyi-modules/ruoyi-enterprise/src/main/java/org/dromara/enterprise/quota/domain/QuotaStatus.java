/**
 * [INPUT]: 依赖 V1 quota policy 状态检查约束。
 * [OUTPUT]: 对外提供 ACTIVE/DISABLED 配额状态。
 * [POS]: quota/domain 的状态真源，只有 ACTIVE 策略参与预留和 bootstrap。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

public enum QuotaStatus {
    ACTIVE,
    DISABLED
}
