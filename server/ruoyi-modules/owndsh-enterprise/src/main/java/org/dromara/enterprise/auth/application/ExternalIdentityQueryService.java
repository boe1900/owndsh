/**
 * [INPUT]: 依赖 ExternalIdentityStore 的 tenant/user 限定摘要查询
 * [OUTPUT]: 对外提供单个平台用户的外部身份只读摘要列表
 * [POS]: auth/application 的管理查询用例，隔离 Controller 与 JDBC 并拒绝非法用户 ID
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.auth.domain.ExternalIdentitySummary;
import org.dromara.enterprise.auth.persistence.ExternalIdentityStore;

import java.util.List;
import java.util.Objects;

public final class ExternalIdentityQueryService {
    private final ExternalIdentityStore identities;

    public ExternalIdentityQueryService(ExternalIdentityStore identities) {
        this.identities = Objects.requireNonNull(identities, "identities");
    }

    public List<ExternalIdentitySummary> summaries(String tenantId, long userId) {
        if (tenantId == null || tenantId.isBlank() || userId <= 0) {
            throw new IllegalArgumentException("tenantId/userId 非法");
        }
        return identities.findSummariesByUser(tenantId, userId);
    }
}
