/**
 * [INPUT]: 接收 tenant、ManagedModel 聚合与 expected revision。
 * [OUTPUT]: 对外提供模型 keyset/find/insert/update/status/delete CAS 持久化端口。
 * [POS]: model/persistence 的模型 DIP 边界，provider 存在性由 application 显式校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.persistence;

import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelStatus;

import java.util.List;
import java.util.Optional;

public interface ManagedModelStore {
    List<ManagedModel> list(String tenantId, long afterId, int limit);

    Optional<ManagedModel> find(String tenantId, long modelId);

    void insert(ManagedModel model);

    boolean update(ManagedModel model, long expectedRevision);

    boolean updateStatus(String tenantId, long modelId, ModelStatus status, long expectedRevision);

    boolean delete(String tenantId, long modelId, long expectedRevision);
}
