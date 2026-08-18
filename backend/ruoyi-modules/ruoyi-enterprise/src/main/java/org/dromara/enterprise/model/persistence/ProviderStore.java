/**
 * [INPUT]: 接收 tenant 边界、ModelProvider 聚合与 expected revision。
 * [OUTPUT]: 对外提供 provider keyset/find/insert/update/status CAS 持久化端口。
 * [POS]: model/persistence 的 provider DIP 边界，application 不依赖 JDBC 或密文列细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.persistence;

import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;

import java.util.List;
import java.util.Optional;

public interface ProviderStore {
    List<ModelProvider> list(String tenantId, long afterId, int limit);

    Optional<ModelProvider> find(String tenantId, long providerId);

    void insert(ModelProvider provider);

    boolean update(ModelProvider provider, long expectedRevision);

    boolean updateStatus(String tenantId, long providerId, ModelStatus status, long expectedRevision);
}
