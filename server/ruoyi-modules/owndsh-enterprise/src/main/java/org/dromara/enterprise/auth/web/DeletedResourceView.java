/**
 * [INPUT]: 接收成功删除的资源 ID。
 * [OUTPUT]: 对外提供可进入统一成功 envelope 的 id/deleted DTO。
 * [POS]: auth/web 的删除确认协议，避免 204 绕过 requestId 响应体约定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

/**
 * 已删除资源视图。
 */
public record DeletedResourceView(String id, boolean deleted) {
    public static DeletedResourceView of(long id) {
        return new DeletedResourceView(Long.toString(id), true);
    }
}
