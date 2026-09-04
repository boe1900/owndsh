/**
 * [INPUT]: 接收已成功删除的 quota policy ID。
 * [OUTPUT]: 对外提供统一 DeletedResourceResponse data 结构。
 * [POS]: quota/web 的删除确认 DTO，不伪造已不存在资源的 revision。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.web;

public record DeletedQuotaPolicyView(String id, boolean deleted) {
    public static DeletedQuotaPolicyView of(long id) {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        return new DeletedQuotaPolicyView(Long.toString(id), true);
    }
}
