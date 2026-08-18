/**
 * [INPUT]: 依赖 EffectiveQuotaResolver 与 reservation 固化窗口的统一锁序规则。
 * [OUTPUT]: 验证 adapter 返回乱序时仍按 policy ID 解析，并按 policy/type 而非 window ID 加锁。
 * [POS]: T09 死锁预防单测，守住预留、结算、释放和恢复共享的全局窗口顺序。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;
import org.dromara.enterprise.quota.domain.QuotaWindowType;
import org.dromara.enterprise.quota.domain.ReservedWindow;
import org.dromara.enterprise.quota.persistence.QuotaPolicyStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class QuotaOrderingTest {
    @Test
    void sortsEffectivePoliciesAndWindowLocksByTheSameStableOrder() {
        QuotaPolicyStore store = mock(QuotaPolicyStore.class);
        when(store.findEffective("000000", 101, 201L)).thenReturn(List.of(
            policy(30, QuotaSubjectType.USER, 101L),
            policy(10, QuotaSubjectType.DEFAULT, null),
            policy(20, QuotaSubjectType.DEPT, 201L)
        ));

        assertThat(new EffectiveQuotaResolver(store).resolve("000000", 101, 201L))
            .extracting(QuotaPolicy::id)
            .containsExactly(10L, 20L, 30L);

        List<ReservedWindow> ordered = QuotaReservationService.orderedWindows(List.of(
            new ReservedWindow(1, 30, QuotaWindowType.MONTH, 10),
            new ReservedWindow(2, 10, QuotaWindowType.MONTH, 10),
            new ReservedWindow(4, 30, QuotaWindowType.DAY, 10),
            new ReservedWindow(3, 10, QuotaWindowType.DAY, 10)
        ));
        assertThat(ordered)
            .extracting(ReservedWindow::policyId, ReservedWindow::windowType)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple(10L, QuotaWindowType.DAY),
                org.assertj.core.groups.Tuple.tuple(10L, QuotaWindowType.MONTH),
                org.assertj.core.groups.Tuple.tuple(30L, QuotaWindowType.DAY),
                org.assertj.core.groups.Tuple.tuple(30L, QuotaWindowType.MONTH)
            );
    }

    private static QuotaPolicy policy(long id, QuotaSubjectType type, Long subjectId) {
        return new QuotaPolicy(
            id, "000000", "Policy " + id, type, subjectId, null,
            1_000L, null, null, null, QuotaStatus.ACTIVE, 0
        );
    }
}
