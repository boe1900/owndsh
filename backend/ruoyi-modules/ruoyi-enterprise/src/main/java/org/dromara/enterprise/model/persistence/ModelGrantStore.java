/**
 * [INPUT]: 接收授权聚合、tenant/subject 查询边界和 expected revision。
 * [OUTPUT]: 对外提供授权 CRUD、主体存在性与有效模型候选查询端口。
 * [POS]: model/persistence 的授权 DIP 边界，resolver 不拼接 SQL 或信任客户端 subject 名称。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.persistence;

import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.GrantedModel;
import org.dromara.enterprise.model.domain.ModelGrant;

import java.util.List;
import java.util.Optional;

public interface ModelGrantStore {
    List<ModelGrant> list(String tenantId, long afterId, int limit);

    Optional<ModelGrant> find(String tenantId, long grantId);

    void insert(ModelGrant grant);

    boolean update(ModelGrant grant, long expectedRevision);

    boolean delete(String tenantId, long grantId, long expectedRevision);

    boolean subjectExists(String tenantId, GrantSubjectType subjectType, long subjectId);

    String subjectName(String tenantId, GrantSubjectType subjectType, long subjectId);

    List<GrantedModel> findEffectiveCandidates(String tenantId, long userId, Long departmentId);
}
