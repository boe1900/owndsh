/**
 * [INPUT]: 依赖 V6 已验证且冻结的 deployment ZoneId。
 * [OUTPUT]: 对外提供任意 Instant 所在自然 DAY/MONTH 的 UTC start 和 resetsAt。
 * [POS]: quota/application 的唯一时间边界计算器，避免 SQL/JVM 默认时区分叉。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.quota.domain.QuotaWindowType;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Objects;

public final class QuotaWindowCalculator {
    private final ZoneId zone;

    public QuotaWindowCalculator(ZoneId zone) {
        this.zone = Objects.requireNonNull(zone, "zone");
    }

    public WindowBounds bounds(Instant instant, QuotaWindowType type) {
        Objects.requireNonNull(instant, "instant");
        Objects.requireNonNull(type, "type");
        LocalDate date = instant.atZone(zone).toLocalDate();
        ZonedDateTime start = type == QuotaWindowType.DAY
            ? date.atStartOfDay(zone)
            : date.withDayOfMonth(1).atStartOfDay(zone);
        ZonedDateTime reset = type == QuotaWindowType.DAY ? start.plusDays(1) : start.plusMonths(1);
        return new WindowBounds(type, start.toInstant(), reset.toInstant());
    }

    public ZoneId zone() {
        return zone;
    }

    public record WindowBounds(QuotaWindowType type, Instant start, Instant resetsAt) {
    }
}
