/**
 * [INPUT]: 接收已校验且 metadata 白名单化的 AuditEvent。
 * [OUTPUT]: 对外提供只含 append 的审计持久化端口。
 * [POS]: Application Service 依赖的 DIP 抽象，不暴露 update/delete 能力。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

/**
 * 只追加审计持久化端口。
 */
@FunctionalInterface
public interface AuditSink {
    /**
     * 在调用方当前事务中追加事件。
     *
     * @param event 审计事件
     */
    void append(AuditEvent event);
}
