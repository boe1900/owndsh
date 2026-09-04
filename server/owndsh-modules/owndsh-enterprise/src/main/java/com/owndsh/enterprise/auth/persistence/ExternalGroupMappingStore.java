/**
 * [INPUT]: 接收 tenant/source/keyset 分页查询、映射聚合与 expected revision。
 * [OUTPUT]: 对外提供组映射 CRUD、用户组存在性、批量解析与可检测变化的来源成员关系同步。
 * [POS]: IdentityGroupMappingService/ExternalIdentityService 的持久化 DIP 端口，隔离用户组关系 SQL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.persistence;

import com.owndsh.enterprise.auth.domain.ExternalGroupMapping;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 外部组映射存储端口。
 */
public interface ExternalGroupMappingStore {
    List<ExternalGroupMapping> list(String tenantId, long sourceId, long afterId, int limit);

    Optional<ExternalGroupMapping> find(String tenantId, long mappingId);

    void insert(ExternalGroupMapping mapping);

    boolean delete(String tenantId, long mappingId, long expectedRevision);

    boolean accessGroupExists(String tenantId, long accessGroupId);

    Map<String, Long> findAccessGroups(long sourceId, Collection<String> externalGroups);

    boolean replaceSourceMemberships(long sourceId, long userId, Collection<Long> accessGroupIds);

    void rebuildSourceMemberships(long sourceId);
}
