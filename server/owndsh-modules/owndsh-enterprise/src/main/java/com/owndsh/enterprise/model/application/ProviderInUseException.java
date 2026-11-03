/**
 * [INPUT]: 接收供应商删除时同租户下的连接数量。
 * [OUTPUT]: 对外提供供应商删除阻塞的稳定领域异常。
 * [POS]: model/application 的父资源删除约束，阻止绕过连接树直接删除供应商。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

public final class ProviderInUseException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_RESOURCE_IN_USE";
    private final long connectionCount;

    public ProviderInUseException(long connectionCount) {
        super("该供应商仍有 " + connectionCount + " 个连接，请先删除连接后再删除供应商");
        this.connectionCount = connectionCount;
    }

    public long connectionCount() { return connectionCount; }
}
