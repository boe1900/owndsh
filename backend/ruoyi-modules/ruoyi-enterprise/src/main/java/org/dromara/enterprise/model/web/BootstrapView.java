/**
 * [INPUT]: 投影 BootstrapService 的用户、ACTIVE 设备、revision、有效模型/配额与 T13 插件分配。
 * [OUTPUT]: 对外提供 T06 严格客户端所需的完整脱敏 bootstrap 外壳。
 * [POS]: model/web 的 runtime 配置输出边界；插件复用下载授权事实，T16 Session 仍保持 disabled。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.application.BootstrapService;

import java.util.List;
import java.util.Base64;

public record BootstrapView(
    long revision,
    User user,
    Device device,
    List<Model> models,
    List<Quota> quotas,
    Plugins plugins,
    SessionPolicy sessionPolicy
) {
    public static BootstrapView from(BootstrapService.BootstrapSnapshot snapshot) {
        return new BootstrapView(
            snapshot.revision(),
            new User(
                Long.toString(snapshot.user().id()), snapshot.user().username(), snapshot.user().displayName(),
                snapshot.user().departmentId() == null ? null : Long.toString(snapshot.user().departmentId())
            ),
            new Device(
                Long.toString(snapshot.device().id()), snapshot.device().installationId().toString(), "ACTIVE"
            ),
            snapshot.models().stream().map(value -> new Model(
                value.alias(), value.displayName(), value.contextWindow(), value.maxOutputTokens(),
                value.reasoning(), value.isDefault()
            )).toList(),
            snapshot.quotas().stream().map(value -> new Quota(
                Long.toString(value.id()), value.subjectType().name(), value.dailyTokenLimit(),
                value.monthlyTokenLimit(), value.rpm(), value.concurrency()
            )).toList(),
            new Plugins(
                snapshot.plugins().revision(),
                snapshot.plugins().assignments().stream().map(value -> new PluginAssignment(
                    Long.toString(value.pluginVersionId()), value.packageName(), value.version(), value.sizeBytes(),
                    value.sha256(), Base64.getEncoder().encodeToString(value.signature()), value.compatibility(),
                    value.desiredState().name().equals("INSTALLED")
                        ? "/enterprise/api/v1/plugins/versions/" + value.pluginVersionId() + "/download"
                        : null,
                    value.required(), value.desiredState().name()
                )).toList()
            ),
            new SessionPolicy(false, 90, 1_048_576)
        );
    }

    public record User(String id, String username, String displayName, String departmentId) {
    }

    public record Device(String id, String installationId, String status) {
    }

    public record Model(
        String alias,
        String displayName,
        int contextWindow,
        int maxOutputTokens,
        boolean reasoning,
        boolean isDefault
    ) {
    }

    public record Quota(
        String policyId,
        String scope,
        Long dailyTokenLimit,
        Long monthlyTokenLimit,
        Integer rpm,
        Integer concurrency
    ) {
    }

    public record Plugins(long revision, List<PluginAssignment> assignments) {
    }

    public record PluginAssignment(
        String pluginVersionId,
        String packageName,
        String version,
        long sizeBytes,
        String sha256,
        String signatureBase64,
        org.dromara.enterprise.plugin.domain.PluginCompatibility compatibility,
        String downloadUrl,
        boolean required,
        String desiredState
    ) {
    }

    public record SessionPolicy(boolean enabled, int retentionDays, int maxBatchBytes) {
    }
}
