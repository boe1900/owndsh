/**
 * [INPUT]: 依赖策略锚点连续 5 小时分段与部署时区的自然日、周、月边界。
 * [OUTPUT]: 对外提供 FIVE_HOURS/DAY/WEEK/MONTH 窗口封闭枚举。
 * [POS]: quota/domain 的 Token 累计周期真源，与 V1 check 约束同构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

public enum QuotaWindowType {
    FIVE_HOURS,
    DAY,
    WEEK,
    MONTH
}
