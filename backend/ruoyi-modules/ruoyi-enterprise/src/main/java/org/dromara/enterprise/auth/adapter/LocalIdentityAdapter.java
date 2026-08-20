/**
 * [INPUT]: 依赖 LocalAccountStore 原子改密、RuoYi LoginFailurePolicy、共享 LOCAL 密码策略与 BCrypt。
 * [OUTPUT]: 对外提供 LOCAL 认证、首次强制改密、稳定 userId subject 和不枚举账号的 principal。
 * [POS]: IdentityAdapter 的本地实现，旧密码校验成功后才允许一次条件改密，不承担平台会话签发。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import cn.hutool.crypto.digest.BCrypt;
import org.dromara.enterprise.auth.domain.IdentityCredential;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LocalPasswordPolicy;
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
        enforceInitialPasswordChange(authenticated, passwordCredentials);
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

    private void enforceInitialPasswordChange(LocalAccount account, PasswordCredentials credentials) {
        if (!account.passwordChangeRequired()) return;
        char[] newPassword = credentials.newPassword();
        if (newPassword == null) throw new LocalPasswordChangeRequiredException(false);
        try {
            try {
                LocalPasswordPolicy.validate(account.username(), newPassword);
            } catch (IllegalArgumentException exception) {
                throw new LocalPasswordChangeRequiredException(true);
            }
            String newPasswordText = new String(newPassword);
            if (BCrypt.checkpw(newPasswordText, account.passwordHash())) {
                throw new LocalPasswordChangeRequiredException(true);
            }
            String newHash = BCrypt.hashpw(newPasswordText);
            if (!accounts.changePasswordIfRequired(account.userId(), account.passwordHash(), newHash)) {
                throw new IdentityAuthenticationException();
            }
        } finally {
            Arrays.fill(newPassword, '\0');
        }
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
