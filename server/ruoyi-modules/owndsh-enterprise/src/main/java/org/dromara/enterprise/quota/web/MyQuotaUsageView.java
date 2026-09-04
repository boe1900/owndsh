/**
 * [INPUT]: 投影 QuotaUsageQueryService 的有效策略与当前 Token/rate counters。
 * [OUTPUT]: 对外提供 OpenAPI QuotaUsagePolicy 的资源范围、四类 Token 窗口、RPM 与并发切片。
 * [POS]: quota/web 的员工本人用量输出，不暴露其他用户、prompt 或 reservation 内部状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import org.dromara.enterprise.quota.application.QuotaUsageQueryService;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;
import org.dromara.enterprise.quota.domain.QuotaResourceType;

import java.time.Instant;

public record MyQuotaUsageView(
    String policyId,
    String name,
    QuotaSubjectType scope,
    String subjectId,
    QuotaResourceType resourceType,
    String resourceId,
    String resourceName,
    TokenWindow fiveHours,
    TokenWindow daily,
    TokenWindow weekly,
    TokenWindow monthly,
    Rate rpm,
    Concurrency concurrency
) {
    public static MyQuotaUsageView from(QuotaUsageQueryService.PolicyUsage value) {
        return new MyQuotaUsageView(
            Long.toString(value.policy().id()), value.policy().name(), value.policy().subjectType(),
            value.policy().subjectId() == null ? null : Long.toString(value.policy().subjectId()),
            value.policy().resourceType(),
            value.policy().resourceId() == null ? null : Long.toString(value.policy().resourceId()),
            value.policy().resourceName(), TokenWindow.from(value.fiveHours()), TokenWindow.from(value.daily()),
            TokenWindow.from(value.weekly()), TokenWindow.from(value.monthly()),
            Rate.from(value.rpm()), Concurrency.from(value.concurrency())
        );
    }

    public record TokenWindow(long limit, long usedTokens, long reservedTokens, Instant resetsAt) {
        static TokenWindow from(QuotaUsageQueryService.WindowUsage value) {
            return value == null ? null : new TokenWindow(
                value.limit(), value.usedTokens(), value.reservedTokens(), value.resetsAt()
            );
        }
    }

    public record Rate(int limit, int current, Instant resetsAt) {
        static Rate from(QuotaUsageQueryService.RateUsage value) {
            return value == null ? null : new Rate(value.limit(), value.current(), value.resetsAt());
        }
    }

    public record Concurrency(int limit, int current) {
        static Concurrency from(QuotaUsageQueryService.ConcurrencyUsage value) {
            return value == null ? null : new Concurrency(value.limit(), value.current());
        }
    }
}
