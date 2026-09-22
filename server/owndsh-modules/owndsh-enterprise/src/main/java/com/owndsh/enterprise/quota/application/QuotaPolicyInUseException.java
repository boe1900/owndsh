/**
 * [INPUT]: 接收配额策略删除时确认的历史窗口数量。
 * [OUTPUT]: 对外提供稳定的配额策略资源占用异常和删除阻塞详情。
 * [POS]: quota/application 的历史数据保护边界，引导停用策略而非物理删除。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

/**
 * 配额策略已有历史窗口记录。
 */
public final class QuotaPolicyInUseException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_RESOURCE_IN_USE";

    private final long quotaWindowCount;

    public QuotaPolicyInUseException(long quotaWindowCount) {
        super("配额策略已有使用窗口记录");
        if (quotaWindowCount < 1) throw new IllegalArgumentException("配额窗口计数必须为正数");
        this.quotaWindowCount = quotaWindowCount;
    }

    public long quotaWindowCount() {
        return quotaWindowCount;
    }
}
