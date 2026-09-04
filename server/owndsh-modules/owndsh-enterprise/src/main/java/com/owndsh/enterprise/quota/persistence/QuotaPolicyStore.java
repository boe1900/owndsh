/**
 * [INPUT]: 接收 tenant、subject、策略聚合和 expected revision。
 * [OUTPUT]: 对外提供策略 CRUD/CAS、主体存在性及生效策略查询端口。
 * [POS]: quota/application 依赖的 DIP 抽象，隐藏 Host subject 与 PostgreSQL join 细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import com.owndsh.enterprise.quota.domain.QuotaPolicy;
import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;

import java.util.List;
import java.util.Optional;

public interface QuotaPolicyStore {
    List<QuotaPolicy> list(String tenantId, long afterId, int limit);

    Optional<QuotaPolicy> find(String tenantId, long id);

    List<QuotaPolicy> findEffective(String tenantId, long userId, Long modelId);

    boolean subjectExists(QuotaSubjectType type, Long subjectId);

    boolean resourceExists(String tenantId, com.owndsh.enterprise.quota.domain.QuotaResourceType type, Long resourceId);

    void insert(QuotaPolicy policy);

    boolean update(QuotaPolicy policy, long expectedRevision);

    boolean setStatus(String tenantId, long id, long expectedRevision, QuotaStatus status);

    boolean delete(String tenantId, long id, long expectedRevision);
}
