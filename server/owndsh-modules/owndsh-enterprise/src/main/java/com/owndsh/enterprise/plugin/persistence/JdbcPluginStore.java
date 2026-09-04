/**
 * [INPUT]: 依赖 Spring JdbcOperations、Jackson 3 与 V2/V8 插件表、sys_user/sys_dept 主体事实。
 * [OUTPUT]: 实现 catalog/version CAS、自然键幂等、窗口函数优先级、assignment replace 和 inventory upsert。
 * [POS]: plugin/persistence 的 PostgreSQL adapter，所有业务查询同时限定 tenant 与 package ownership。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.persistence;

import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import com.owndsh.enterprise.plugin.domain.PluginAssignment;
import com.owndsh.enterprise.plugin.domain.PluginCompatibility;
import com.owndsh.enterprise.plugin.domain.PluginPackage;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import com.owndsh.enterprise.plugin.domain.RuntimePluginAssignment;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.json.JsonMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcPluginStore implements PluginStore {
    private static final String PACKAGE_COLUMNS =
        "id, tenant_id, package_name, display_name, status, revision";
    private static final String VERSION_COLUMNS = """
        v.id, v.tenant_id, v.package_id, p.package_name, v.version, v.artifact_ref,
        v.size_bytes, v.sha256, v.signature, v.compatibility_json, v.status,
        v.created_by, v.created_at, v.revision
        """;
    private static final String ASSIGNMENT_COLUMNS = """
        id, tenant_id, package_id, plugin_version_id, subject_type, subject_id,
        desired_state, required, status, revision
        """;
    private static final String FIND_PACKAGE_NAME_FOR_UPDATE =
        "select " + PACKAGE_COLUMNS + " from ent_plugin_package where tenant_id=? and package_name=? for update";
    private static final String FIND_PACKAGE_ID =
        "select " + PACKAGE_COLUMNS + " from ent_plugin_package where tenant_id=? and id=?";
    private static final String FIND_PACKAGE_ID_FOR_UPDATE = FIND_PACKAGE_ID + " for update";
    private static final String LIST_PACKAGES =
        "select " + PACKAGE_COLUMNS + " from ent_plugin_package where tenant_id=? and id>? order by id limit ?";
    private static final String INSERT_PACKAGE = """
        insert into ent_plugin_package(id,tenant_id,package_name,display_name,status,revision)
        values (?,?,?,?,?,?)
        """;
    private static final String INCREMENT_PACKAGE = """
        update ent_plugin_package set revision=revision+1
        where tenant_id=? and id=? and revision=?
        """;
    private static final String FIND_VERSION = "select " + VERSION_COLUMNS + """
        from ent_plugin_version v join ent_plugin_package p on p.id=v.package_id
        where v.tenant_id=? and v.id=?
        """;
    private static final String FIND_EXISTING_VERSION = "select " + VERSION_COLUMNS + """
        from ent_plugin_version v join ent_plugin_package p on p.id=v.package_id
        where v.tenant_id=? and (v.sha256=? or (p.package_name=? and v.version=?))
        order by case when p.package_name=? and v.version=? then 0 else 1 end, v.id
        limit 1
        """;
    private static final String LIST_VERSIONS = "select " + VERSION_COLUMNS + """
        from ent_plugin_version v join ent_plugin_package p on p.id=v.package_id
        where v.tenant_id=? and v.package_id=? order by v.id desc limit 100
        """;
    private static final String INSERT_VERSION = """
        insert into ent_plugin_version(
            id,tenant_id,package_id,version,artifact_ref,size_bytes,sha256,signature,
            compatibility_json,status,created_by,created_at,revision
        ) values (?,?,?,?,?,?,?,?,cast(? as jsonb),?,?,?,?)
        """;
    private static final String TRANSITION_VERSION = """
        update ent_plugin_version set status=?, revision=revision+1
        where tenant_id=? and id=? and status=? and revision=?
        """;
    private static final String LIST_ASSIGNMENTS =
        "select " + ASSIGNMENT_COLUMNS + " from ent_plugin_assignment "
            + "where tenant_id=? and package_id=? order by id";
    private static final String DELETE_ASSIGNMENTS =
        "delete from ent_plugin_assignment where tenant_id=? and package_id=?";
    private static final String INSERT_ASSIGNMENT = """
        insert into ent_plugin_assignment(
            id,tenant_id,package_id,plugin_version_id,subject_type,subject_id,
            desired_state,required,status,revision
        ) values (?,?,?,?,?,?,?,?,?,?)
        """;
    private static final String EFFECTIVE_ASSIGNMENTS = """
        with ranked as (
            select v.id as plugin_version_id, p.package_name, v.version, v.size_bytes,
                   v.sha256, v.signature, v.compatibility_json, a.required, a.desired_state,
                   row_number() over (
                       partition by a.package_id
                       order by case a.subject_type when 'USER' then 1 when 'DEPT' then 2 else 3 end, a.id
                   ) as priority
            from ent_plugin_assignment a
            join ent_plugin_package p on p.id=a.package_id and p.tenant_id=a.tenant_id
            join ent_plugin_version v on v.id=a.plugin_version_id and v.package_id=a.package_id
            where a.tenant_id=? and a.status='ACTIVE' and p.status='ACTIVE'
              and v.status in ('PUBLISHED','RETIRED')
              and (
                  (a.subject_type='USER' and a.subject_id=?)
                  or (a.subject_type='DEPT' and cast(? as bigint) is not null and a.subject_id=cast(? as bigint))
                  or (a.subject_type='ALL' and a.subject_id is null)
              )
        )
        select plugin_version_id, package_name, version, size_bytes, sha256, signature,
               compatibility_json, required, desired_state
        from ranked where priority=1 order by package_name
        """;
    private static final String DELETE_INVENTORY =
        "delete from ent_device_plugin where tenant_id=? and device_id=?";
    private static final String INSERT_INVENTORY = """
        insert into ent_device_plugin(
            id,tenant_id,device_id,package_name,version,sha256,desired_revision,
            state,loader_phase,last_error_code,observed_at
        ) values (?,?,?,?,?,?,?,?,?,?,?)
        """;
    private static final String LIST_INVENTORY = """
        select i.id,i.tenant_id,i.device_id,u.user_name as username,i.package_name,i.version,
               i.sha256,i.desired_revision,i.state,i.loader_phase,i.last_error_code,i.observed_at
        from ent_device_plugin i
        join ent_device d on d.id=i.device_id and d.tenant_id=i.tenant_id
        join sys_user u on u.user_id=d.user_id
        where i.tenant_id=? and i.id>? order by i.id limit ?
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper json;
    private final RowMapper<PluginPackage> packageMapper = this::mapPackage;
    private final RowMapper<PluginVersion> versionMapper = this::mapVersion;
    private final RowMapper<PluginAssignment> assignmentMapper = this::mapAssignment;

    public JdbcPluginStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
    }

    @Override
    public Optional<PluginPackage> findPackageByNameForUpdate(String tenantId, String packageName) {
        return jdbc.query(FIND_PACKAGE_NAME_FOR_UPDATE, packageMapper, tenantId, packageName).stream().findFirst();
    }

    @Override
    public Optional<PluginPackage> findPackageById(String tenantId, long packageId) {
        return jdbc.query(FIND_PACKAGE_ID, packageMapper, tenantId, packageId).stream().findFirst();
    }

    @Override
    public Optional<PluginPackage> findPackageByIdForUpdate(String tenantId, long packageId) {
        return jdbc.query(FIND_PACKAGE_ID_FOR_UPDATE, packageMapper, tenantId, packageId).stream().findFirst();
    }

    @Override
    public List<PluginPackage> listPackages(String tenantId, long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("插件分页参数非法");
        return jdbc.query(LIST_PACKAGES, packageMapper, tenantId, afterId, limit);
    }

    @Override
    public void insertPackage(PluginPackage value) {
        jdbc.update(
            INSERT_PACKAGE, value.id(), value.tenantId(), value.packageName(), value.displayName(),
            value.status().name(), value.revision()
        );
    }

    @Override
    public boolean incrementPackageRevision(String tenantId, long packageId, long expectedRevision) {
        return jdbc.update(INCREMENT_PACKAGE, tenantId, packageId, expectedRevision) == 1;
    }

    @Override
    public Optional<PluginVersion> findExistingVersion(
        String tenantId,
        String packageName,
        String version,
        String sha256
    ) {
        return jdbc.query(
            FIND_EXISTING_VERSION, versionMapper,
            tenantId, sha256, packageName, version, packageName, version
        ).stream().findFirst();
    }

    @Override
    public Optional<PluginVersion> findVersion(String tenantId, long versionId) {
        return jdbc.query(FIND_VERSION, versionMapper, tenantId, versionId).stream().findFirst();
    }

    @Override
    public List<PluginVersion> listVersions(String tenantId, long packageId) {
        return jdbc.query(LIST_VERSIONS, versionMapper, tenantId, packageId);
    }

    @Override
    public void insertVersion(PluginVersion value) {
        jdbc.update(
            INSERT_VERSION,
            value.id(), value.tenantId(), value.packageId(), value.version(), value.artifactRef(),
            value.sizeBytes(), value.sha256(), value.signature(), json.writeValueAsString(value.compatibility()),
            value.status().name(), value.createdBy(), at(value.createdAt()), value.revision()
        );
    }

    @Override
    public boolean transitionVersion(
        String tenantId,
        long versionId,
        PluginVersion.Status from,
        PluginVersion.Status to,
        long expectedRevision
    ) {
        return jdbc.update(
            TRANSITION_VERSION, to.name(), tenantId, versionId, from.name(), expectedRevision
        ) == 1;
    }

    @Override
    public List<PluginAssignment> listAssignments(String tenantId, long packageId) {
        return jdbc.query(LIST_ASSIGNMENTS, assignmentMapper, tenantId, packageId);
    }

    @Override
    public void deleteAssignments(String tenantId, long packageId) {
        jdbc.update(DELETE_ASSIGNMENTS, tenantId, packageId);
    }

    @Override
    public void insertAssignment(PluginAssignment value) {
        jdbc.update(
            INSERT_ASSIGNMENT,
            value.id(), value.tenantId(), value.packageId(), value.pluginVersionId(), value.subjectType().name(),
            value.subjectId(), value.desiredState().name(), value.required(), value.status().name(), value.revision()
        );
    }

    @Override
    public boolean subjectExists(PluginAssignment.SubjectType subjectType, long subjectId) {
        if (subjectType == PluginAssignment.SubjectType.ALL) return false;
        String sql = subjectType == PluginAssignment.SubjectType.USER
            ? "select exists(select 1 from sys_user where user_id=? and del_flag='0')"
            : "select exists(select 1 from sys_dept where dept_id=? and del_flag='0')";
        return Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class, subjectId));
    }

    @Override
    public List<RuntimePluginAssignment> findEffectiveAssignments(
        String tenantId,
        long userId,
        Long departmentId
    ) {
        return jdbc.query(
            EFFECTIVE_ASSIGNMENTS,
            (resultSet, rowNumber) -> new RuntimePluginAssignment(
                resultSet.getLong("plugin_version_id"), resultSet.getString("package_name"),
                resultSet.getString("version"), resultSet.getLong("size_bytes"), resultSet.getString("sha256"),
                resultSet.getBytes("signature"), compatibility(resultSet.getString("compatibility_json")),
                resultSet.getBoolean("required"),
                PluginAssignment.DesiredState.valueOf(resultSet.getString("desired_state"))
            ),
            tenantId, userId, departmentId, departmentId
        );
    }

    @Override
    public void replaceInventory(String tenantId, long deviceId, List<DevicePluginInventory> inventory) {
        jdbc.update(DELETE_INVENTORY, tenantId, deviceId);
        for (DevicePluginInventory value : inventory) {
            jdbc.update(
                INSERT_INVENTORY,
                value.id(), tenantId, deviceId, value.packageName(), value.version(), value.sha256(),
                value.desiredRevision(), value.state().name(), value.loaderPhase(), value.lastErrorCode(),
                at(value.observedAt())
            );
        }
    }

    @Override
    public List<DevicePluginInventory> listInventory(String tenantId, long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("库存分页参数非法");
        return jdbc.query(LIST_INVENTORY, this::mapInventory, tenantId, afterId, limit);
    }

    private PluginPackage mapPackage(ResultSet resultSet, int rowNumber) throws SQLException {
        return new PluginPackage(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getString("package_name"),
            resultSet.getString("display_name"), PluginPackage.Status.valueOf(resultSet.getString("status")),
            resultSet.getLong("revision")
        );
    }

    private PluginVersion mapVersion(ResultSet resultSet, int rowNumber) throws SQLException {
        return new PluginVersion(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getLong("package_id"),
            resultSet.getString("package_name"), resultSet.getString("version"),
            resultSet.getString("artifact_ref"), resultSet.getLong("size_bytes"), resultSet.getString("sha256"),
            resultSet.getBytes("signature"), compatibility(resultSet.getString("compatibility_json")),
            PluginVersion.Status.valueOf(resultSet.getString("status")), resultSet.getLong("created_by"),
            instant(resultSet, "created_at"), resultSet.getLong("revision")
        );
    }

    private PluginAssignment mapAssignment(ResultSet resultSet, int rowNumber) throws SQLException {
        Long subject = resultSet.getObject("subject_id", Long.class);
        return new PluginAssignment(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getLong("package_id"),
            resultSet.getLong("plugin_version_id"),
            PluginAssignment.SubjectType.valueOf(resultSet.getString("subject_type")),
            subject,
            PluginAssignment.DesiredState.valueOf(resultSet.getString("desired_state")),
            resultSet.getBoolean("required"), PluginAssignment.Status.valueOf(resultSet.getString("status")),
            resultSet.getLong("revision")
        );
    }

    private DevicePluginInventory mapInventory(ResultSet resultSet, int rowNumber) throws SQLException {
        return new DevicePluginInventory(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getLong("device_id"),
            resultSet.getString("username"), resultSet.getString("package_name"), resultSet.getString("version"),
            resultSet.getString("sha256"), resultSet.getLong("desired_revision"),
            DevicePluginInventory.State.valueOf(resultSet.getString("state")), resultSet.getString("loader_phase"),
            resultSet.getString("last_error_code"), instant(resultSet, "observed_at")
        );
    }

    private PluginCompatibility compatibility(String value) {
        return json.readValue(value, PluginCompatibility.class);
    }

    private static OffsetDateTime at(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        return resultSet.getObject(column, OffsetDateTime.class).toInstant();
    }
}
