/**
 * [INPUT]: 依赖 Spring JdbcOperations 和 V5 seed 的 BOOTSTRAP revision 行。
 * [OUTPUT]: 对外提供 WHERE revision=? 的 PostgreSQL CAS 实现。
 * [POS]: revision 存储端口的 JDBC adapter，冲突稳定映射 RevisionConflictException。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.revision;

import org.springframework.jdbc.core.JdbcOperations;

import java.util.Objects;

/**
 * PostgreSQL BOOTSTRAP revision store。
 */
public final class JdbcBootstrapRevisionStore implements BootstrapRevisionStore {
    private static final String SCOPE = "BOOTSTRAP";
    private static final String CURRENT_SQL = """
        select revision from ent_platform_revision where tenant_id = ? and scope = ?
        """;
    private static final String CAS_SQL = """
        update ent_platform_revision
        set revision = revision + 1, updated_at = now()
        where tenant_id = ? and scope = ? and revision = ?
        """;

    private final JdbcOperations jdbc;

    public JdbcBootstrapRevisionStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public long current(String tenantId) {
        requireTenant(tenantId);
        Long revision = jdbc.queryForObject(CURRENT_SQL, Long.class, tenantId, SCOPE);
        if (revision == null) {
            throw new IllegalStateException("BOOTSTRAP revision seed 不存在");
        }
        return revision;
    }

    @Override
    public long compareAndIncrement(String tenantId, long expectedRevision) {
        requireTenant(tenantId);
        if (expectedRevision < 0 || expectedRevision == Long.MAX_VALUE) {
            throw new IllegalArgumentException("expectedRevision 超出范围");
        }
        if (jdbc.update(CAS_SQL, tenantId, SCOPE, expectedRevision) == 1) {
            return expectedRevision + 1;
        }
        throw new RevisionConflictException(expectedRevision, current(tenantId));
    }

    private static void requireTenant(String tenantId) {
        Objects.requireNonNull(tenantId, "tenantId");
        if (tenantId.isBlank()) {
            throw new IllegalArgumentException("tenantId 不能为空");
        }
    }
}
