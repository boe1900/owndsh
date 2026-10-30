/**
 * [INPUT]: 依赖 mock SkillStore、revision、audit 和内存事务执行器。
 * [OUTPUT]: 验证 P1 catalog 的 draft 登记、CAS 发布和撤销状态机。
 * [POS]: skill/application 的管理状态回归，不替代 PostgreSQL migration/HTTP 集成验收。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.skill.application.SkillCatalogService;
import com.owndsh.enterprise.skill.application.SkillMutationContext;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import com.owndsh.enterprise.skill.persistence.SkillStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@Tag("dev")
class SkillCatalogServiceTest {
    private static final SkillMutationContext CONTEXT = new SkillMutationContext(
        "000000", 7, "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
    );

    @Test
    void registersDraftThenPublishesRevokesAndRestoresWithCas() {
        SkillStore skills = mock(SkillStore.class);
        BootstrapRevisionStore revisions = mock(BootstrapRevisionStore.class);
        SkillRelease draft = release(SkillRelease.Status.DRAFT, 0);
        SkillRelease published = release(SkillRelease.Status.PUBLISHED, 1);
        SkillRelease revoked = release(SkillRelease.Status.REVOKED, 2);
        when(skills.findRelease("000000", "code-review", "1.0.0"))
            .thenReturn(Optional.empty(), Optional.of(draft), Optional.of(published), Optional.of(published), Optional.of(revoked), Optional.of(revoked));
        when(skills.findRelease("000000", 9001L))
            .thenReturn(Optional.of(draft), Optional.of(published), Optional.of(published), Optional.of(revoked), Optional.of(revoked), Optional.of(published));
        when(skills.transitionRelease("000000", 9001, SkillRelease.Status.DRAFT,
            SkillRelease.Status.PUBLISHED, 0)).thenReturn(true);
        when(skills.transitionRelease("000000", 9001, SkillRelease.Status.PUBLISHED,
            SkillRelease.Status.REVOKED, 1)).thenReturn(true);
        when(skills.transitionRelease("000000", 9001, SkillRelease.Status.REVOKED,
            SkillRelease.Status.PUBLISHED, 2)).thenReturn(true);
        when(revisions.increment("000000")).thenReturn(11L, 12L, 13L);
        TransactionOperations transactions = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> action) {
                return action.doInTransaction(null);
            }
        };
        SkillCatalogService service = new SkillCatalogService(transactions, skills, revisions,
            event -> {}, new AtomicLong(9000)::incrementAndGet);
        SkillCatalogService.SkillReleaseDraft input = new SkillCatalogService.SkillReleaseDraft(
            "code-review", "1.0.0", "Review", "MIT", "OwnDsh", true, true, List.of("dev"),
            1024, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );

        assertThat(service.register(CONTEXT, input).release().status()).isEqualTo(SkillRelease.Status.DRAFT);
        assertThat(service.publish(CONTEXT, 9001, 0).status()).isEqualTo(SkillRelease.Status.PUBLISHED);
        assertThat(service.revoke(CONTEXT, 9001, 1).status()).isEqualTo(SkillRelease.Status.REVOKED);
        assertThat(service.publish(CONTEXT, 9001, 2).status()).isEqualTo(SkillRelease.Status.PUBLISHED);
        verify(skills).insertRelease(any(SkillRelease.class), eq(7L));
    }

    @Test
    void publishingHistoricalReleaseSwitchesCurrentVersion() {
        SkillStore skills = mock(SkillStore.class);
        BootstrapRevisionStore revisions = mock(BootstrapRevisionStore.class);
        SkillRelease historical = release(SkillRelease.Status.PUBLISHED, 4, false);
        when(skills.findRelease("000000", 9001L)).thenReturn(Optional.of(historical), Optional.of(historical));
        when(skills.transitionRelease("000000", 9001, SkillRelease.Status.PUBLISHED,
            SkillRelease.Status.PUBLISHED, 4)).thenReturn(true);
        when(revisions.increment("000000")).thenReturn(14L);
        TransactionOperations transactions = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> action) {
                return action.doInTransaction(null);
            }
        };
        SkillCatalogService service = new SkillCatalogService(transactions, skills, revisions,
            event -> {}, new AtomicLong(9000)::incrementAndGet);

        assertThat(service.publish(CONTEXT, 9001, 4)).isEqualTo(historical);
        verify(skills).transitionRelease("000000", 9001, SkillRelease.Status.PUBLISHED,
            SkillRelease.Status.PUBLISHED, 4);
    }

    private static SkillRelease release(SkillRelease.Status status, long revision) {
        return release(status, revision, status == SkillRelease.Status.PUBLISHED);
    }

    private static SkillRelease release(SkillRelease.Status status, long revision, boolean current) {
        return new SkillRelease(9001, "000000", "code-review", "1.0.0", "Review", "MIT", "OwnDsh",
            true, true, List.of("dev"), 1024,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "MANUAL", "", "", null,
            "SOURCE_ARCHIVE", "artifact.zip", null, "", current, status, revision);
    }
}
