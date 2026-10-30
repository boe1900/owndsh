/**
 * [INPUT]: 依赖真实 SecretCipher、凭据存储 mock 和内存事务执行器。
 * [OUTPUT]: 验证凭据加密、脱敏、租户/项目范围校验和请求后清零。
 * [POS]: skill/application 的秘密生命周期回归，隔离 HTTP 与 PostgreSQL adapter。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.skill.application.SkillMutationContext;
import com.owndsh.enterprise.skill.application.SkillSourceCredentialService;
import com.owndsh.enterprise.skill.domain.SkillSourceCredential;
import com.owndsh.enterprise.skill.persistence.SkillSourceCredentialStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class SkillSourceCredentialServiceTest {
    private static final SkillMutationContext CONTEXT = new SkillMutationContext(
        "000000", 7, "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
    );

    @Test
    void encryptsAndScopesCredentialWhileClearingInput() {
        SkillSourceCredentialStore store = mock(SkillSourceCredentialStore.class);
        SkillSourceCredentialService service = new SkillSourceCredentialService(
            transactions(), store, new SecretCipher(new byte[32]), new AtomicLong(9000)::incrementAndGet);
        SkillSourceCredentialService.CredentialInput input = new SkillSourceCredentialService.CredentialInput(
            "内网 GitLab", "gitlab.example.com", "team/skills", Instant.now().plusSeconds(3600),
            "glpat-secret-value".toCharArray());

        SkillSourceCredential created = service.create(CONTEXT, input);
        when(store.find("000000", created.id())).thenReturn(Optional.of(created));

        assertThat(created.tokenHint()).isEqualTo("glpat-••••alue");
        assertThat(service.secret("000000", created.id(), "https://gitlab.example.com/team/skills.git"))
            .containsExactly("glpat-secret-value".toCharArray());
        assertThat(input.token()).containsOnly('\0');
        assertThatThrownBy(() -> service.secret("000000", created.id(), "https://gitlab.example.com/other/repo"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("项目范围不匹配");
    }

    private static TransactionOperations transactions() {
        return new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> action) {
                return action.doInTransaction(null);
            }
        };
    }
}
