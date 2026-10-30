/**
 * [INPUT]: 依赖租户、仓库 host/project、凭据密文和凭据生命周期状态。
 * [OUTPUT]: 对外提供脱敏的仓库访问凭据事实；密文仅在服务端内部使用。
 * [POS]: skill/domain 的来源凭据身份，与 SkillRelease 通过 credentialId 关联。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.domain;

import com.owndsh.enterprise.crypto.EncryptedSecret;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public record SkillSourceCredential(
    long id,
    String tenantId,
    String name,
    String host,
    String projectPath,
    String tokenHint,
    Instant expiresAt,
    Status status,
    EncryptedSecret secret,
    long revision
) {
    private static final Pattern HOST = Pattern.compile("^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$");
    private static final Pattern PROJECT = Pattern.compile("^[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$");

    public SkillSourceCredential {
        if (id <= 0 || revision < 0) throw new IllegalArgumentException("skill credential 数值非法");
        require(tenantId, 20, "tenantId");
        require(name, 120, "name");
        require(host, 255, "host");
        if (!HOST.matcher(host).matches()) throw new IllegalArgumentException("skill credential host 非法");
        if (projectPath != null && !projectPath.isBlank() && !PROJECT.matcher(projectPath).matches()) {
            throw new IllegalArgumentException("skill credential projectPath 非法");
        }
        require(tokenHint, 32, "tokenHint");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(secret, "secret");
    }

    private static void require(String value, int max, String field) {
        if (value == null || value.isBlank() || value.length() > max) {
            throw new IllegalArgumentException(field + " 非法");
        }
    }

    public boolean usable(Instant now) {
        return status == Status.ACTIVE && (expiresAt == null || expiresAt.isAfter(now));
    }

    public enum Status { ACTIVE, EXPIRED, REVOKED }
}
