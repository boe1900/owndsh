/**
 * [INPUT]: 接收 tenant/keyset 分页查询、完整 IdentitySource、连接测试结果与资源 expected revision。
 * [OUTPUT]: 对外提供身份源 seek-page/find/insert/update/status CAS 及最近测试持久化端口。
 * [POS]: IdentitySourceService 的 DIP 边界，隐藏 JSONB、bytea 和 PostgreSQL SQL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * 身份源存储端口。
 */
public interface IdentitySourceStore {
    List<IdentitySource> list(String tenantId, long afterId, int limit);

    List<IdentitySource> listActive(String tenantId, int limit);

    Optional<IdentitySource> find(String tenantId, long sourceId);

    void insert(IdentitySource source);

    boolean update(IdentitySource source, long expectedRevision);

    boolean updateStatus(
        String tenantId,
        long sourceId,
        IdentitySourceStatus status,
        long expectedRevision,
        Instant updatedAt
    );

    boolean recordConnectionTest(
        String tenantId,
        long sourceId,
        boolean ok,
        String diagnostic,
        Instant testedAt
    );
}
