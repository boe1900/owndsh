/**
 * [INPUT]: 由 quota policy/window 查询不到 tenant 内资源时抛出。
 * [OUTPUT]: 对外提供映射 ENT_RESOURCE_NOT_FOUND 的稳定领域异常。
 * [POS]: quota/application 到统一 HTTP 404 的边界，不暴露 SQL 或内部 ID 查询过程。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

public final class QuotaResourceNotFoundException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public QuotaResourceNotFoundException() {
        super("配额资源不存在");
    }
}
