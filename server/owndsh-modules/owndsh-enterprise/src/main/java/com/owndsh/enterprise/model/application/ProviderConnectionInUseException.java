/**
 * [INPUT]: 接收连接删除时同租户下的受管模型数量。
 * [OUTPUT]: 对外提供连接删除阻塞的稳定领域异常。
 * [POS]: model/application 的连接父资源删除约束，避免删除后模型失去真实路由。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

public final class ProviderConnectionInUseException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_RESOURCE_IN_USE";
    private final long managedModelCount;

    public ProviderConnectionInUseException(long managedModelCount) {
        super("该连接仍有 " + managedModelCount + " 个受管模型，请先删除模型后再删除连接");
        this.managedModelCount = managedModelCount;
    }

    public long managedModelCount() { return managedModelCount; }
}
