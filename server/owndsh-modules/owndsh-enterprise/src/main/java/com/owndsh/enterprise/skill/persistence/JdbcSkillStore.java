/**
 * [INPUT]: 依赖 Spring JdbcOperations、skill release/catalog 表和 Jackson 3。
 * [OUTPUT]: 实现租户隔离的 release 目录查询、状态变更与登记；发布换 current 指针时先降级旧 current 再 CAS 晋升，两步同事务，绕开立即检查的部分唯一索引 uq_ent_skill_current_release。
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
        resolved_commit,artifact_provider,artifact_ref,source_credential_id,release_notes,
        current_release,status,revision
        """;
    private static final String LIST_RELEASES = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and id>? order by id limit ?";
    private static final String LIST_PUBLISHED = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and status='PUBLISHED' and current_release=true " +
        "order by skill_name, version desc limit ?";
    private static final String FIND_RELEASE = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and id=?";
    private static final String FIND_RELEASE_BY_VERSION = "select " + COLUMNS +
        " from ent_skill_release where tenant_id=? and skill_name=? and version=?";
    // ─────────────────────────────────────────────────────────────────────────────
    // uq_ent_skill_current_release 是 PostgreSQL 立即检查（非 deferrable）的部分唯一索引：
    // 单条 UPDATE 同时"晋升目标 + 降级旧 current"时，唯一性按行处理顺序即时校验，
    // 目标行先被扫描就会先插入 current 索引项、撞上旧 current 仍存在的索引项
    // （DuplicateKeyException，且是否触发取决于堆顺序，表现为间歇性发布失败）。
    // 因此发布换指针必须固定顺序：第一步降级同 skill 的旧 current，第二步 CAS 晋升目标；
    // 两步由 SkillCatalogService 的同一事务包裹，失败整体回滚。
    // ─────────────────────────────────────────────────────────────────────────────
    private static final String DEMOTE_CURRENT_RELEASE = """
        update ent_skill_release release
        set current_release=false, revision=revision+1
        where release.tenant_id=? and release.current_release=true and release.id<>?
            and release.skill_name=(select target.skill_name from ent_skill_release target
                where target.tenant_id=? and target.id=?)
        """;
    private static final String TRANSITION_RELEASE = """
        update ent_skill_release release
        set status=?, current_release=(?='PUBLISHED'), revision=revision+1
        where release.tenant_id=? and release.id=? and status=? and revision=?
        """;
    private static final String INSERT_RELEASE = """
        insert into ent_skill_release(
            id,tenant_id,skill_name,version,description,license,author,user_invocable,
            model_invocable,categories_json,artifact_size_bytes,artifact_sha256,source_type,source_locator,
            resolved_commit,artifact_provider,artifact_ref,source_credential_id,release_notes,
            current_release,status,created_by,revision
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        // 顺序即正确性：先降级旧 current（腾出部分唯一索引项），再晋升目标
        if (to == SkillRelease.Status.PUBLISHED) {
            jdbc.update(DEMOTE_CURRENT_RELEASE, tenantId, releaseId, tenantId, releaseId);
        }
        return jdbc.update(TRANSITION_RELEASE, to.name(), to.name(), tenantId, releaseId,
            from.name(), expectedRevision) == 1;
    }

    @Override
    public void insertRelease(SkillRelease value, long createdBy) {
        jdbc.update(INSERT_RELEASE, value.id(), value.tenantId(), value.name(), value.version(), value.description(),
            value.license(), value.author(), value.userInvocable(), value.modelInvocable(),
            json.writeValueAsString(value.categories()), value.artifactSizeBytes(), value.artifactSha256(),
            value.sourceType(), value.sourceLocator(), value.resolvedCommit(),
            value.artifactProvider(), value.artifactRef(), value.sourceCredentialId(), value.releaseNotes(),
            value.current(), value.status().name(), createdBy, value.revision());
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
            rs.getString("resolved_commit"), rs.getString("artifact_provider"),
            rs.getString("artifact_ref"), (Long) rs.getObject("source_credential_id"), rs.getString("release_notes"),
            rs.getBoolean("current_release"), SkillRelease.Status.valueOf(rs.getString("status")), rs.getLong("revision")
        );
    }
}
