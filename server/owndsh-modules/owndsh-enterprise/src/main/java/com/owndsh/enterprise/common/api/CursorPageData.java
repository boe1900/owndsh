/**
 * [INPUT]: 接收当前页白名单 DTO 列表与 CursorPageMetadata。
 * [OUTPUT]: 对外提供 OpenAPI 列表 data 的 items/page 固定结构。
 * [POS]: common/api 的通用分页成功载荷，禁止各纵向 Controller 发明不同列表 envelope。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import java.util.List;
import java.util.Objects;

/**
 * Cursor 分页数据。
 */
public record CursorPageData<T>(List<T> items, CursorPageMetadata page) {
    public CursorPageData {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        page = Objects.requireNonNull(page, "page");
        if (items.size() > page.limit()) {
            throw new IllegalArgumentException("分页 items 不能超过 limit");
        }
    }
}
