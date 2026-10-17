/**
 * [INPUT]: 依赖 SkillStore、BootstrapRevisionStore mock 与已发布目录。
 * [OUTPUT]: 验证 resolver 只返回租户已发布 skill，并携带同一 revision。
 * [POS]: skill/application 纯单元回归，隔离 JDBC、设备认证和 HTTP 翻译。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.skill.application.EffectiveSkillResolver;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import com.owndsh.enterprise.skill.persistence.SkillStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class EffectiveSkillResolverTest {
    @Test
    void returnsPublishedCatalogAndBootstrapRevision() {
        SkillStore store = mock(SkillStore.class);
        BootstrapRevisionStore revisions = mock(BootstrapRevisionStore.class);
        SkillRelease skill = new SkillRelease(9001, "000000", "code-review", "1.0.0", "review", "MIT", "OwnDsh",
            true, true, List.of("dev"), 1024,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", SkillRelease.Status.PUBLISHED, 1);
        when(store.listPublishedReleases("000000", 200)).thenReturn(List.of(skill));
        when(revisions.current("000000")).thenReturn(12L);

        EffectiveSkillResolver.ResolvedSkills resolved = new EffectiveSkillResolver(store, revisions).resolve("000000");

        assertThat(resolved.revision()).isEqualTo(12L);
        assertThat(resolved.skills()).containsExactly(skill);
    }
}
