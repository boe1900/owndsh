/**
 * [INPUT]: 依赖 EffectiveModelResolver、ModelGrantStore mock 与 USER/DEPT 授权候选。
 * [OUTPUT]: 验证缺少 USER 默认时的 DEPT 默认选择及空候选安全返回。
 * [POS]: T08 默认模型裁决的纯单元回归，隔离 JDBC 与 bootstrap 编排。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model;

import org.dromara.enterprise.model.application.EffectiveModelResolver;
import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.GrantedModel;
import org.dromara.enterprise.model.domain.ProviderApiProtocol;
import org.dromara.enterprise.model.persistence.ModelGrantStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class EffectiveModelResolverTest {
    @Test
    void selectsDepartmentDefaultWhenUserHasNoDefault() {
        ModelGrantStore grants = mock(ModelGrantStore.class);
        when(grants.findEffectiveCandidates("000000", 7, 11L)).thenReturn(List.of(
            candidate(1, "chat", 10, GrantSubjectType.USER, false),
            candidate(2, "reasoner", 20, GrantSubjectType.DEPT, true)
        ));

        List<EffectiveModelResolver.EffectiveModel> resolved =
            new EffectiveModelResolver(grants).resolve("000000", 7, 11L);

        assertThat(resolved).extracting(EffectiveModelResolver.EffectiveModel::alias)
            .containsExactly("chat", "reasoner");
        assertThat(resolved).filteredOn(EffectiveModelResolver.EffectiveModel::isDefault)
            .singleElement().extracting(EffectiveModelResolver.EffectiveModel::alias)
            .isEqualTo("reasoner");
    }

    @Test
    void returnsEmptyWhenNoGrantIsEffective() {
        ModelGrantStore grants = mock(ModelGrantStore.class);
        when(grants.findEffectiveCandidates("000000", 7, null)).thenReturn(List.of());

        assertThat(new EffectiveModelResolver(grants).resolve("000000", 7, null)).isEmpty();
    }

    private static GrantedModel candidate(
        long id,
        String alias,
        int sortOrder,
        GrantSubjectType subjectType,
        boolean isDefault
    ) {
        return new GrantedModel(
            id, alias, alias, 65_536, 8_192, ProviderApiProtocol.OPENAI_COMPLETIONS,
            null, null, sortOrder, subjectType, isDefault
        );
    }
}
