/**
 * [INPUT]: 接收 tenant/user 限定的外部身份绑定与脱敏身份源元数据
 * [OUTPUT]: 对外提供 source/name/type、稳定 subject 和最后登录只读摘要
 * [POS]: auth/domain 的管理查询投影，不携带外部 token、claims、groups 或身份源 secret
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.time.Instant;
import java.util.Objects;

public record ExternalIdentitySummary(
    long sourceId,
    String sourceName,
    IdentitySourceType sourceType,
    String externalSubject,
    Instant lastLoginAt
) {
    public ExternalIdentitySummary {
        if (sourceId <= 0) throw new IllegalArgumentException("身份源 ID 必须为正数");
        if (Objects.requireNonNull(sourceName, "sourceName").isBlank()) {
            throw new IllegalArgumentException("身份源名称不能为空");
        }
        Objects.requireNonNull(sourceType, "sourceType");
        if (Objects.requireNonNull(externalSubject, "externalSubject").isBlank()) {
            throw new IllegalArgumentException("externalSubject 不能为空");
        }
    }
}
