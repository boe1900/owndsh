/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 skill source credential 表。
 * [OUTPUT]: 实现租户隔离的凭据查询、插入、轮换和撤销。
 * [POS]: skill/persistence 的 PostgreSQL adapter；永不向管理 DTO 返回明文 token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.persistence;

import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.skill.domain.SkillSourceCredential;
import org.springframework.jdbc.core.JdbcOperations;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcSkillSourceCredentialStore implements SkillSourceCredentialStore {
    private static final String COLUMNS = "id,tenant_id,name,host,project_path,token_hint,expires_at,status," +
        "credential_ciphertext,credential_nonce,key_version,revision";
    private final JdbcOperations jdbc;

    public JdbcSkillSourceCredentialStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public List<SkillSourceCredential> list(String tenantId) {
        return jdbc.query("select " + COLUMNS + " from ent_skill_source_credential " +
            "where tenant_id=? order by name,id", this::credential, tenantId);
    }

    @Override
    public Optional<SkillSourceCredential> find(String tenantId, long id) {
        return jdbc.query("select " + COLUMNS + " from ent_skill_source_credential where tenant_id=? and id=?",
            this::credential, tenantId, id).stream().findFirst();
    }

    @Override
    public void insert(SkillSourceCredential value, long createdBy) {
        EncryptedSecret secret = value.secret();
        jdbc.update("""
            insert into ent_skill_source_credential(
                id,tenant_id,name,host,project_path,token_hint,expires_at,status,
                credential_ciphertext,credential_nonce,key_version,created_by,revision
            ) values (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, value.id(), value.tenantId(), value.name(), value.host(), value.projectPath(),
            value.tokenHint(), value.expiresAt(), value.status().name(), secret.ciphertext(), secret.nonce(),
            secret.keyVersion(), createdBy, value.revision());
    }

    @Override
    public boolean update(SkillSourceCredential value, long expectedRevision) {
        EncryptedSecret secret = value.secret();
        return jdbc.update("""
            update ent_skill_source_credential set name=?,host=?,project_path=?,token_hint=?,expires_at=?,
                status=?,credential_ciphertext=?,credential_nonce=?,key_version=?,revision=revision+1
            where tenant_id=? and id=? and revision=?
            """, value.name(), value.host(), value.projectPath(), value.tokenHint(), value.expiresAt(),
            value.status().name(), secret.ciphertext(), secret.nonce(), secret.keyVersion(), value.tenantId(),
            value.id(), expectedRevision) == 1;
    }

    @Override
    public boolean updateStatus(String tenantId, long id, SkillSourceCredential.Status status, long expectedRevision) {
        return jdbc.update("update ent_skill_source_credential set status=?,revision=revision+1 " +
            "where tenant_id=? and id=? and revision=?", status.name(), tenantId, id, expectedRevision) == 1;
    }

    private SkillSourceCredential credential(ResultSet rs, int row) throws SQLException {
        return new SkillSourceCredential(rs.getLong("id"), rs.getString("tenant_id"), rs.getString("name"),
            rs.getString("host"), rs.getString("project_path"), rs.getString("token_hint"),
            rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant(),
            SkillSourceCredential.Status.valueOf(rs.getString("status")),
            new EncryptedSecret(rs.getBytes("credential_ciphertext"), rs.getBytes("credential_nonce"),
                rs.getInt("key_version")), rs.getLong("revision"));
    }
}
