/**
 * [INPUT]: 依赖 PluginStore 的数据库窗口裁决与全局 BOOTSTRAP revision。
 * [OUTPUT]: 对外提供 USER→DEPT→ALL 唯一生效 assignment 集合及单调 revision。
 * [POS]: plugin/application 的生效规则单一入口，bootstrap、重试接口和下载授权必须复用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.application;

import org.dromara.enterprise.plugin.domain.RuntimePluginAssignment;
import org.dromara.enterprise.plugin.persistence.PluginStore;
import org.dromara.enterprise.revision.BootstrapRevisionStore;

import java.util.List;
import java.util.Objects;

public final class EffectivePluginResolver {
    private final PluginStore plugins;
    private final BootstrapRevisionStore revisions;

    public EffectivePluginResolver(PluginStore plugins, BootstrapRevisionStore revisions) {
        this.plugins = Objects.requireNonNull(plugins, "plugins");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
    }

    public ResolvedAssignments resolve(String tenantId, long userId, Long departmentId) {
        return new ResolvedAssignments(
            revisions.current(tenantId),
            plugins.findEffectiveAssignments(tenantId, userId, departmentId)
        );
    }

    public record ResolvedAssignments(long revision, List<RuntimePluginAssignment> assignments) {
        public ResolvedAssignments {
            if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
            assignments = List.copyOf(Objects.requireNonNull(assignments, "assignments"));
        }
    }
}
