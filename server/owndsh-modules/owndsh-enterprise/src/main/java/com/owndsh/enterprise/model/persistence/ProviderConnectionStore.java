/**
 * [INPUT]: 接收 tenant 边界、ProviderConnection 聚合与 expected revision。
 * [OUTPUT]: 对外提供连接 keyset/find/insert/update/status CAS 持久化端口。
 * [POS]: model/persistence 的连接路由 DIP 边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.model.domain.ModelStatus;
import com.owndsh.enterprise.model.domain.ProviderConnection;
import java.util.List;
import java.util.Optional;

public interface ProviderConnectionStore {
    List<ProviderConnection> list(String tenantId, long providerId, long afterId, int limit);
    Optional<ProviderConnection> find(String tenantId, long connectionId);
    void insert(ProviderConnection connection);
    boolean update(ProviderConnection connection, long expectedRevision);
    boolean updateStatus(String tenantId, long connectionId, ModelStatus status, long expectedRevision);
}
