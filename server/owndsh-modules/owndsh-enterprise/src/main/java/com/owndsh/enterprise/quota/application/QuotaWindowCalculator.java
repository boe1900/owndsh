/**
 * [INPUT]: 依赖 V6 冻结 deployment ZoneId 与策略窗口锚点。
 * [OUTPUT]: 对外提供任意 Instant 所在连续 5 小时或自然日/周/月窗口的 UTC start/reset。
 * [POS]: quota/application 的唯一时间边界计算器，避免 SQL/JVM 默认时区分叉。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import com.owndsh.enterprise.quota.domain.QuotaWindowType;

import java.time.Instant;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Objects;

public final class QuotaWindowCalculator {
    private final ZoneId zone;

    public QuotaWindowCalculator(ZoneId zone) {
        this.zone = Objects.requireNonNull(zone, "zone");
    }

    public WindowBounds bounds(Instant instant, QuotaWindowType type, Instant anchor) {
        Objects.requireNonNull(instant, "instant");
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(anchor, "anchor");
        if (type == QuotaWindowType.FIVE_HOURS) {
            if (instant.isBefore(anchor)) throw new IllegalArgumentException("instant 不能早于窗口锚点");
            Duration elapsed = Duration.between(anchor, instant);
            Instant start = anchor.plus(Duration.ofHours(5).multipliedBy(elapsed.toHours() / 5));
            return new WindowBounds(type, start, start.plus(Duration.ofHours(5)));
        }
        LocalDate date = instant.atZone(zone).toLocalDate();
        ZonedDateTime start = switch (type) {
            case DAY -> date.atStartOfDay(zone);
            case WEEK -> date.minusDays(date.getDayOfWeek().getValue() - 1L).atStartOfDay(zone);
            case MONTH -> date.withDayOfMonth(1).atStartOfDay(zone);
            case FIVE_HOURS -> throw new IllegalStateException("FIVE_HOURS 已提前处理");
        };
        ZonedDateTime reset = switch (type) {
            case DAY -> start.plusDays(1);
            case WEEK -> start.plusWeeks(1);
            case MONTH -> start.plusMonths(1);
            case FIVE_HOURS -> throw new IllegalStateException("FIVE_HOURS 已提前处理");
        };
        return new WindowBounds(type, start.toInstant(), reset.toInstant());
    }

    public ZoneId zone() {
        return zone;
    }

    public record WindowBounds(QuotaWindowType type, Instant start, Instant resetsAt) {
    }
}
