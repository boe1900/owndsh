/**
 * [INPUT]: 依赖 reservation 的两个计费终态。
 * [OUTPUT]: 对外区分 SETTLED 实测结算与 CHARGED_MAX 未知用量的估算扣额。
 * [POS]: quota/domain 的账本结果真源，RELEASED 不产生用量账本。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

public enum UsageResult {
    SETTLED,
    CHARGED_MAX
}
