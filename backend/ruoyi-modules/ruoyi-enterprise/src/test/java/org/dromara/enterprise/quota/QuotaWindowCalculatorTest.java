/**
 * [INPUT]: 依赖 QuotaWindowCalculator、QuotaTokenEstimator 与 Asia/Shanghai 冻结时区。
 * [OUTPUT]: 验证 DST 无关自然日/月边界、月切换和字节除三向上估算。
 * [POS]: T09 纯逻辑门禁，防止 JVM 默认时区或整数截断改变计费。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota;

import org.dromara.enterprise.quota.application.QuotaTokenEstimator;
import org.dromara.enterprise.quota.application.QuotaWindowCalculator;
import org.dromara.enterprise.quota.domain.QuotaWindowType;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class QuotaWindowCalculatorTest {
    private final QuotaWindowCalculator calculator = new QuotaWindowCalculator(ZoneId.of("Asia/Shanghai"));

    @Test
    void calculatesNaturalDayAndMonthInFrozenDeploymentZone() {
        Instant instant = Instant.parse("2026-08-31T16:30:00Z");

        assertThat(calculator.bounds(instant, QuotaWindowType.DAY)).satisfies(bounds -> {
            assertThat(bounds.start()).isEqualTo(Instant.parse("2026-08-31T16:00:00Z"));
            assertThat(bounds.resetsAt()).isEqualTo(Instant.parse("2026-09-01T16:00:00Z"));
        });
        assertThat(calculator.bounds(instant, QuotaWindowType.MONTH)).satisfies(bounds -> {
            assertThat(bounds.start()).isEqualTo(Instant.parse("2026-08-31T16:00:00Z"));
            assertThat(bounds.resetsAt()).isEqualTo(Instant.parse("2026-09-30T16:00:00Z"));
        });
    }

    @Test
    void estimatesVisibleUtf8BytesByCeilingAndReservesOutput() {
        assertThat(QuotaTokenEstimator.estimate(0, null, 8_192)).isEqualTo(8_192);
        assertThat(QuotaTokenEstimator.estimate(1, 100, 8_192)).isEqualTo(101);
        assertThat(QuotaTokenEstimator.estimate(4, 100, 8_192)).isEqualTo(102);
        assertThatThrownBy(() -> QuotaTokenEstimator.estimate(1, 8_193, 8_192))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
