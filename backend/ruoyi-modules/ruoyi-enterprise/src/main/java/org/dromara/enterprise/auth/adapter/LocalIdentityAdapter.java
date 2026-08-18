/**
 * [INPUT]: 依赖 LocalAccountStore、RuoYi LoginFailurePolicy 与 Hutool BCrypt。
 * [OUTPUT]: 对外提供 LOCAL 密码认证、稳定 userId subject 和不枚举账号的统一 principal。
 * [POS]: IdentityAdapter 的本地实现，复用现有 hash/锁定事实但不签发平台会话。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import cn.hutool.crypto.digest.BCrypt;
import org.dromara.enterprise.auth.domain.IdentityCredential;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.PasswordCredentials;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * RuoYi 本地账号身份适配器。
 */
public final class LocalIdentityAdapter implements IdentityAdapter {
    private static final String DUMMY_HASH = "$2a$10$b8yUzN0C71sbz.PhNOCgJe.Tu1yWC3RNrTyjSQ8p1W0.aaUXUJ.Ne";

    private final LocalAccountStore accounts;
    private final LoginFailurePolicy failurePolicy;

    public LocalIdentityAdapter(LocalAccountStore accounts, LoginFailurePolicy failurePolicy) {
        this.accounts = Objects.requireNonNull(accounts, "accounts");
        this.failurePolicy = Objects.requireNonNull(failurePolicy, "failurePolicy");
    }

    @Override
    public IdentitySourceType type() {
        return IdentitySourceType.LOCAL;
    }

    @Override
    public IdentityPrincipal authenticate(IdentitySource source, IdentityCredential credential) {
        requireSource(source);
        if (!(credential instanceof PasswordCredentials passwordCredentials)) {
            throw new IdentityAuthenticationException();
        }
        Optional<LocalAccount> account = accounts.findByUsername(passwordCredentials.username());
        String hash = account.map(LocalAccount::passwordHash).orElse(DUMMY_HASH);
        boolean enabled = account.map(LocalAccount::enabled).orElse(false);
        char[] password = passwordCredentials.password();
        boolean[] matched = new boolean[1];
        try {
            String passwordText = new String(password);
            try {
                failurePolicy.verify(passwordCredentials.username(), () -> {
                    matched[0] = BCrypt.checkpw(passwordText, hash) && enabled;
                    return !matched[0];
                });
            } catch (RuntimeException exception) {
                throw new IdentityAuthenticationException(exception);
            }
        } finally {
            Arrays.fill(password, '\0');
        }
        LocalAccount authenticated = account.orElseThrow(IdentityAuthenticationException::new);
        if (!matched[0]) {
            throw new IdentityAuthenticationException();
        }
        return new IdentityPrincipal(
            Long.toString(source.id()),
            type(),
            Long.toString(authenticated.userId()),
            authenticated.username(),
            authenticated.displayName(),
            authenticated.email(),
            List.of()
        );
    }

    @Override
    public IdentitySourceConnection testConnection(IdentitySource source) {
        requireSource(source);
        return IdentitySourceConnection.ready(type());
    }

    private static void requireSource(IdentitySource source) {
        if (source.type() != IdentitySourceType.LOCAL) {
            throw new IllegalArgumentException("LOCAL adapter 收到错误身份源类型");
        }
    }
}
