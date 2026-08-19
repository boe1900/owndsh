/**
 * [INPUT]: 接收稳定 source/issuer/subject、source/user 查询和登录同步数据。
 * [OUTPUT]: 对外提供 external identity find/insert/touch 与 tenant/user 摘要查询持久化端口。
 * [POS]: ExternalIdentityService 的 DIP 边界，唯一约束冲突由 application 映射稳定错误码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.ExternalIdentity;
import org.dromara.enterprise.auth.domain.ExternalIdentitySummary;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * 外部身份绑定存储端口。
 */
public interface ExternalIdentityStore {
    Optional<ExternalIdentity> findBySubject(long sourceId, String issuer, String externalSubject);

    Optional<ExternalIdentity> findBySourceAndUser(long sourceId, long userId);

    List<ExternalIdentitySummary> findSummariesByUser(String tenantId, long userId);

    void insert(ExternalIdentity identity);

    void touch(long identityId, List<String> groups, Instant loginAt);
}
