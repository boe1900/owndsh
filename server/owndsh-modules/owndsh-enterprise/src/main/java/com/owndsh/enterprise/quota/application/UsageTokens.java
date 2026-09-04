/**
 * [INPUT]: 接收上游 usage 的 input/output/cache read+write 汇总。
 * [OUTPUT]: 对外提供非负分类与溢出安全 totalTokens。
 * [POS]: quota/application 的结算值对象，隔离上游 DTO 差异与 ledger schema。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

public record UsageTokens(long inputTokens, long outputTokens, long cacheTokens) {
    public UsageTokens {
        if (inputTokens < 0 || outputTokens < 0 || cacheTokens < 0) {
            throw new IllegalArgumentException("usage Token 不能为负数");
        }
        totalTokens();
    }

    public long totalTokens() {
        return Math.addExact(Math.addExact(inputTokens, outputTokens), cacheTokens);
    }
}
