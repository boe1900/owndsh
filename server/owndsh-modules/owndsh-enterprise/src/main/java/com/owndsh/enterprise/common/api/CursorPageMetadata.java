/**
 * [INPUT]: 接收一次 keyset 查询的 limit、hasMore 与可选后继 cursor。
 * [OUTPUT]: 对外提供 OpenAPI CursorPage 对应的不可变分页元数据。
 * [POS]: common/api 的列表协议值对象，约束 hasMore 与 nextCursor 必须表达同一事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

/**
 * Cursor 分页元数据。
 */
public record CursorPageMetadata(boolean hasMore, int limit, String nextCursor) {
    public CursorPageMetadata {
        EnterpriseApiValidation.requirePageLimit(limit);
        if (hasMore && (nextCursor == null || nextCursor.isBlank())) {
            throw new IllegalArgumentException("存在下一页时 nextCursor 不能为空");
        }
        if (!hasMore && nextCursor != null) {
            throw new IllegalArgumentException("没有下一页时 nextCursor 必须为空");
        }
    }
}
