/**
 * [INPUT]: 接收 tenant、catalog/version CAS、完整 assignment 集合和 ACTIVE 设备 inventory 事实。
 * [OUTPUT]: 提供自然键幂等、USER→DEPT→ALL 生效查询、主体存在性和 inventory replace 端口。
 * [POS]: plugin application 的 PostgreSQL DIP 边界，隐藏 JSONB/bytea/窗口函数和 SQL 锁细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.persistence;

import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import com.owndsh.enterprise.plugin.domain.PluginAssignment;
import com.owndsh.enterprise.plugin.domain.PluginPackage;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import com.owndsh.enterprise.plugin.domain.RuntimePluginAssignment;

import java.util.List;
import java.util.Optional;

public interface PluginStore {
    Optional<PluginPackage> findPackageByNameForUpdate(String tenantId, String packageName);

    Optional<PluginPackage> findPackageById(String tenantId, long packageId);

    Optional<PluginPackage> findPackageByIdForUpdate(String tenantId, long packageId);

    List<PluginPackage> listPackages(String tenantId, long afterId, int limit);

    void insertPackage(PluginPackage pluginPackage);

    boolean incrementPackageRevision(String tenantId, long packageId, long expectedRevision);

    Optional<PluginVersion> findExistingVersion(
        String tenantId,
        String packageName,
        String version,
        String sha256
    );

    Optional<PluginVersion> findVersion(String tenantId, long versionId);

    List<PluginVersion> listVersions(String tenantId, long packageId);

    void insertVersion(PluginVersion version);

    boolean transitionVersion(
        String tenantId,
        long versionId,
        PluginVersion.Status from,
        PluginVersion.Status to,
        long expectedRevision
    );

    List<PluginAssignment> listAssignments(String tenantId, long packageId);

    void deleteAssignments(String tenantId, long packageId);

    void insertAssignment(PluginAssignment assignment);

    boolean subjectExists(PluginAssignment.SubjectType subjectType, long subjectId);

    List<RuntimePluginAssignment> findEffectiveAssignments(
        String tenantId,
        long userId,
        Long departmentId
    );

    void replaceInventory(String tenantId, long deviceId, List<DevicePluginInventory> inventory);

    List<DevicePluginInventory> listInventory(String tenantId, long afterId, int limit);
}
