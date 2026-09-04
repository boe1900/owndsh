/**
 * [INPUT]: 依赖 EffectiveModelResolver、ModelGrantStore mock 与已合并的全员/成员授权候选。
 * [OUTPUT]: 验证排序首项默认、重复模型去重及空候选安全返回。
 * [POS]: 模型访问策略的纯单元回归，隔离 JDBC 与 bootstrap 编排。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model;

import com.owndsh.enterprise.model.application.EffectiveModelResolver;
import com.owndsh.enterprise.model.domain.GrantedModel;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.model.persistence.ModelGrantStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class EffectiveModelResolverTest {
    @Test
    void selectsFirstSortedDistinctModelAsDefault() {
        ModelGrantStore grants = mock(ModelGrantStore.class);
        when(grants.findEffectiveCandidates("000000", 7)).thenReturn(List.of(
            candidate(1, "chat", 20),
            candidate(2, "reasoner", 10),
            candidate(2, "reasoner", 30)
        ));

        List<EffectiveModelResolver.EffectiveModel> resolved =
            new EffectiveModelResolver(grants).resolve("000000", 7);

        assertThat(resolved).extracting(EffectiveModelResolver.EffectiveModel::alias)
            .containsExactly("reasoner", "chat");
        assertThat(resolved).filteredOn(EffectiveModelResolver.EffectiveModel::isDefault)
            .singleElement().extracting(EffectiveModelResolver.EffectiveModel::alias)
            .isEqualTo("reasoner");
    }

    @Test
    void returnsEmptyWhenNoGrantIsEffective() {
        ModelGrantStore grants = mock(ModelGrantStore.class);
        when(grants.findEffectiveCandidates("000000", 7)).thenReturn(List.of());

        assertThat(new EffectiveModelResolver(grants).resolve("000000", 7)).isEmpty();
    }

    private static GrantedModel candidate(long id, String alias, int sortOrder) {
        return new GrantedModel(
            id, alias, alias, 65_536, 8_192, ProviderApiProtocol.OPENAI_COMPLETIONS,
            null, null, sortOrder
        );
    }
}
