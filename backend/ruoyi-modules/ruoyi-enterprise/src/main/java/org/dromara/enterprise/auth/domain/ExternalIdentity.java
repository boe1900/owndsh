/**
 * [INPUT]: 接收身份源稳定 issuer/subject 到 RuoYi user 的绑定及最近组/登录事实。
 * [OUTPUT]: 对外提供防御性复制组列表的 ExternalIdentity。
 * [POS]: auth 领域的稳定账号绑定聚合，禁止用 email 或 username 替代唯一 subject。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * 外部身份到平台用户绑定。
 */
public record ExternalIdentity(
    long id,
    String tenantId,
    long sourceId,
    long userId,
    String issuer,
    String externalSubject,
    List<String> lastGroups,
    Instant lastLoginAt
) {
    public ExternalIdentity {
        if (id <= 0 || sourceId <= 0 || userId <= 0) {
            throw new IllegalArgumentException("身份绑定 ID 必须为正数");
        }
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(issuer, "issuer");
        Objects.requireNonNull(externalSubject, "externalSubject");
        if (tenantId.isBlank() || externalSubject.isBlank()) {
            throw new IllegalArgumentException("身份绑定字段不能为空");
        }
        lastGroups = List.copyOf(Objects.requireNonNull(lastGroups, "lastGroups"));
    }
}
