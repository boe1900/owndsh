/**
 * [INPUT]: 投影 plugin catalog/version/assignment/runtime/inventory 领域对象。
 * [OUTPUT]: 对外提供字符串化 snowflake、完整 catalog assignments、安装配置与严格 HTTP views。
 * [POS]: plugin/web 的统一安全投影，管理端和 runtime 共用安装配置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.owndsh.enterprise.plugin.application.EffectivePluginResolver;
import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import com.owndsh.enterprise.plugin.domain.PluginAssignment;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import com.owndsh.enterprise.plugin.domain.PluginInstallation;
import com.owndsh.enterprise.plugin.domain.PluginMarketMetadata;
import com.owndsh.enterprise.plugin.domain.PluginSource;
import com.owndsh.enterprise.plugin.domain.PluginEngines;
import com.owndsh.enterprise.plugin.domain.RuntimePluginAssignment;

import java.time.Instant;
import java.util.List;

public final class PluginViews {
    private PluginViews() {
    }

    public static PackageView packageView(PluginCatalogService.CatalogItem value) {
        return new PackageView(
            Long.toString(value.pluginPackage().id()), value.pluginPackage().packageName(),
            value.pluginPackage().displayName(), value.pluginPackage().status().name(),
            value.pluginPackage().revision(), value.versions().stream().map(PluginViews::version).toList(),
            value.assignments().stream().map(PluginViews::assignment).toList(), value.pluginPackage().marketMetadata()
        );
    }

    public static VersionView version(PluginVersion value) {
        return new VersionView(
            Long.toString(value.id()), Long.toString(value.packageId()), value.packageName(), value.version(),
            value.status().name(), value.createdAt(), value.revision(), value.installation(),
            value.source(), value.engines(), value.publishedAt()
        );
    }

    public static AssignmentView assignment(PluginAssignment value) {
        return new AssignmentView(
            Long.toString(value.id()), Long.toString(value.packageId()), Long.toString(value.pluginVersionId()),
            value.subjectType().name(), value.subjectId() == null ? null : Long.toString(value.subjectId()),
            value.desiredState().name(), value.required(), value.status().name(), value.revision()
        );
    }

    public static RuntimeAssignmentsView runtime(EffectivePluginResolver.ResolvedAssignments resolved) {
        return new RuntimeAssignmentsView(
            resolved.revision(), resolved.assignments().stream().map(PluginViews::runtime).toList()
        );
    }

    public static RuntimeAssignmentView runtime(RuntimePluginAssignment value) {
        return new RuntimeAssignmentView(
            Long.toString(value.pluginVersionId()), value.packageName(), value.version(),
            value.required(), value.desiredState().name(), value.installation(), value.source(), value.engines()
        );
    }

    public static InventoryView inventory(DevicePluginInventory value) {
        return new InventoryView(
            Long.toString(value.deviceId()), value.username(), value.packageName(), value.version(),
            value.desiredRevision(), value.state().name(), value.loaderPhase(), value.lastErrorCode(),
            value.observedAt()
        );
    }

    public record PackageView(
        String id,
        String packageName,
        String displayName,
        String status,
        long revision,
        List<VersionView> versions,
        List<AssignmentView> assignments,
        PluginMarketMetadata marketMetadata
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record VersionView(
        String id,
        String packageId,
        String packageName,
        String version,
        String status,
        Instant createdAt,
        long revision,
        PluginInstallation installation,
        PluginSource source,
        PluginEngines engines,
        Instant publishedAt
    ) {
        public VersionView(String id, String packageId, String packageName, String version, String status,
            Instant createdAt, long revision, PluginInstallation installation) {
            this(id, packageId, packageName, version, status, createdAt, revision, installation,
                PluginSource.npm(""), new PluginEngines(""), status.equals("PUBLISHED") ? createdAt : null);
        }
    }

    public record AssignmentView(
        String id,
        String packageId,
        String pluginVersionId,
        String subjectType,
        String subjectId,
        String desiredState,
        boolean required,
        String status,
        long revision
    ) {
    }

    public record RuntimeAssignmentsView(long revision, List<RuntimeAssignmentView> assignments) {
    }

    public record RuntimeAssignmentView(
        String pluginVersionId,
        String packageName,
        String version,
        boolean required,
        String desiredState,
        PluginInstallation installation,
        PluginSource source,
        PluginEngines engines
    ) {
    }

    public record InventoryView(
        String deviceId,
        String username,
        String packageName,
        String version,
        long desiredRevision,
        String state,
        String loaderPhase,
        String lastErrorCode,
        Instant observedAt
    ) {
    }

    public record InventoryAck(int reported) {
    }
}
