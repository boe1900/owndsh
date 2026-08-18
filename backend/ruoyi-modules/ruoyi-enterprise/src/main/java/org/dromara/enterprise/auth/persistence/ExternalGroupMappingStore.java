/**
 * [INPUT]: 接收 tenant/source/keyset 分页查询、映射聚合与 expected revision。
 * [OUTPUT]: 对外提供组映射 seek-page/find/insert/delete CAS 和部门存在性查询。
 * [POS]: IdentityGroupMappingService 的持久化 DIP 端口，隔离 sys_dept 与映射表 SQL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.ExternalGroupMapping;

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

    boolean departmentExists(long departmentId);

    Map<String, Long> findDepartments(long sourceId, Collection<String> externalGroups);
}
