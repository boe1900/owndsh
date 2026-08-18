/**
 * [INPUT]: 依赖部署时区的自然日和自然月边界。
 * [OUTPUT]: 对外提供 DAY/MONTH 窗口封闭枚举。
 * [POS]: quota/domain 的 Token 累计周期真源，与 V1 check 约束同构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

public enum QuotaWindowType {
    DAY,
    MONTH
}
