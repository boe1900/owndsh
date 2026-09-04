/**
 * [INPUT]: 接收成功删除的模型纵向资源 ID。
 * [OUTPUT]: 对外提供统一 id/deleted=true 响应 DTO。
 * [POS]: model/web 的删除确认协议，保持 requestId envelope 且不依赖 auth/web DTO。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

public record DeletedModelResourceView(String id, boolean deleted) {
    public static DeletedModelResourceView of(long id) {
        return new DeletedModelResourceView(Long.toString(id), true);
    }
}
