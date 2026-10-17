/**
 * [INPUT]: 依赖 Spring JdbcOperations、skill release/catalog 表和 Jackson 3。
 * [OUTPUT]: 实现租户隔离的 release 目录查询、状态变更与登记。
 * [POS]: skill/persistence 的 PostgreSQL adapter；员工端查询只返回已发布的脱敏元数据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.persistence;

import com.owndsh.enterprise.skill.domain.SkillRelease;
import org.springframework.jdbc.core.JdbcOperations;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcSkillStore implements SkillStore {
    private static final String COLUMNS = """
        id,tenant_id,skill_name,version,description,license,author,user_invocable,
        model_invocable,categories_json,artifact_size_bytes,artifact_sha256,source_type,source_locator,
        source_subpath,resolved_commit,artifact_provider,artifact_ref,status,revision
        """;
    private static final String LIST_RELEASES = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and id>? order by id limit ?";
    private static final String LIST_PUBLISHED = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and status='PUBLISHED' order by skill_name, version desc limit ?";
    private static final String FIND_RELEASE = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and id=?";
    private static final String FIND_RELEASE_BY_VERSION = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and skill_name=? and version=?";
    private static final String TRANSITION_RELEASE = """
        update ent_skill_release set status=?, revision=revision+1
        where tenant_id=? and id=? and status=? and revision=?
        """;
    private static final String INSERT_RELEASE = """
        insert into ent_skill_release(
            id,tenant_id,skill_name,version,description,license,author,user_invocable,
            model_invocable,categories_json,artifact_size_bytes,artifact_sha256,source_type,source_locator,
            source_subpath,resolved_commit,artifact_provider,artifact_ref,status,created_by,revision
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper json;

    public JdbcSkillStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
    }

    @Override
    public List<SkillRelease> listReleases(String tenantId, long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("skill release 分页参数非法");
        return jdbc.query(LIST_RELEASES, this::release, tenantId, afterId, limit);
    }

    @Override
    public List<SkillRelease> listPublishedReleases(String tenantId, int limit) {
        if (limit < 1 || limit > 200) throw new IllegalArgumentException("published skill limit 非法");
        return jdbc.query(LIST_PUBLISHED, this::release, tenantId, limit);
    }

    @Override
    public Optional<SkillRelease> findRelease(String tenantId, long releaseId) {
        return jdbc.query(FIND_RELEASE, this::release, tenantId, releaseId).stream().findFirst();
    }

    @Override
    public Optional<SkillRelease> findRelease(String tenantId, String name, String version) {
        return jdbc.query(FIND_RELEASE_BY_VERSION, this::release, tenantId, name, version).stream().findFirst();
    }

    @Override
    public boolean transitionRelease(String tenantId, long releaseId, SkillRelease.Status from,
        SkillRelease.Status to, long expectedRevision) {
        return jdbc.update(TRANSITION_RELEASE, to.name(), tenantId, releaseId, from.name(), expectedRevision) == 1;
    }

    @Override
    public void insertRelease(SkillRelease value, long createdBy) {
        jdbc.update(INSERT_RELEASE, value.id(), value.tenantId(), value.name(), value.version(), value.description(),
            value.license(), value.author(), value.userInvocable(), value.modelInvocable(),
            json.writeValueAsString(value.categories()), value.artifactSizeBytes(), value.artifactSha256(),
            value.sourceType(), value.sourceLocator(), value.sourceSubpath(), value.resolvedCommit(),
            value.artifactProvider(), value.artifactRef(), value.status().name(), createdBy, value.revision());
    }

    private List<String> readCategories(String value) {
        try {
            return json.readValue(value, new TypeReference<>() {});
        } catch (Exception exception) {
            throw new IllegalStateException("skill categories JSON 无效", exception);
        }
    }

    private SkillRelease release(ResultSet rs, int row) throws SQLException {
        return new SkillRelease(
            rs.getLong("id"), rs.getString("tenant_id"), rs.getString("skill_name"), rs.getString("version"),
            rs.getString("description"), rs.getString("license"), rs.getString("author"),
            rs.getBoolean("user_invocable"), rs.getBoolean("model_invocable"),
            readCategories(rs.getString("categories_json")), rs.getLong("artifact_size_bytes"),
            rs.getString("artifact_sha256"), rs.getString("source_type"), rs.getString("source_locator"),
            rs.getString("source_subpath"), rs.getString("resolved_commit"), rs.getString("artifact_provider"),
            rs.getString("artifact_ref"), SkillRelease.Status.valueOf(rs.getString("status")), rs.getLong("revision")
        );
    }
}
