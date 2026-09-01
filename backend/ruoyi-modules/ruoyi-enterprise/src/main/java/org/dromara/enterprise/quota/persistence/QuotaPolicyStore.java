/**
 * [INPUT]: 接收 tenant、subject、策略聚合和 expected revision。
 * [OUTPUT]: 对外提供策略 CRUD/CAS、主体存在性及生效策略查询端口。
 * [POS]: quota/application 依赖的 DIP 抽象，隐藏 RuoYi subject 与 PostgreSQL join 细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;

import java.util.List;
import java.util.Optional;

public interface QuotaPolicyStore {
    List<QuotaPolicy> list(String tenantId, long afterId, int limit);

    Optional<QuotaPolicy> find(String tenantId, long id);

    List<QuotaPolicy> findEffective(String tenantId, long userId);

    boolean subjectExists(QuotaSubjectType type, Long subjectId);

    void insert(QuotaPolicy policy);

    boolean update(QuotaPolicy policy, long expectedRevision);

    boolean setStatus(String tenantId, long id, long expectedRevision, QuotaStatus status);

    boolean delete(String tenantId, long id, long expectedRevision);
}
