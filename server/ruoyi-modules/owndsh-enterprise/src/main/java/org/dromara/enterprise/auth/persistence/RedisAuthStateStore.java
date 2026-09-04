/**
 * [INPUT]: 依赖 RedissonClient、StringCodec、Jackson JsonMapper 与固定登录/授权码 TTL。
 * [OUTPUT]: 对外提供登录事务、改密 challenge、授权码与 OIDC state 的真实 Redis 实现。
 * [POS]: auth/persistence 的短期状态 adapter，使用 SET NX + TTL 和 GETDEL 保证随机键唯一与原子一次性消费。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.LoginTransaction;
import org.dromara.enterprise.auth.domain.OidcLoginState;
import org.dromara.enterprise.auth.domain.PasswordChangeChallenge;
import org.dromara.enterprise.auth.domain.PlatformAuthorizationCode;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.Objects;
import java.util.Optional;

/**
 * Redis 认证短期状态存储。
 */
public final class RedisAuthStateStore
    implements LoginTransactionStore, PasswordChangeChallengeStore, AuthorizationCodeStore, OidcLoginStateStore {

    private static final String TRANSACTION_PREFIX = "enterprise:auth:transaction:";
    private static final String PASSWORD_CHANGE_PREFIX = "enterprise:auth:password-change:";
    private static final String CODE_PREFIX = "enterprise:auth:code:";
    private static final String OIDC_PREFIX = "enterprise:auth:oidc:";

    private final RedissonClient redisson;
    private final JsonMapper jsonMapper;
    private final Duration transactionTtl;
    private final Duration authorizationCodeTtl;

    public RedisAuthStateStore(
        RedissonClient redisson,
        JsonMapper jsonMapper,
        Duration transactionTtl,
        Duration authorizationCodeTtl
    ) {
        this.redisson = Objects.requireNonNull(redisson, "redisson");
        this.jsonMapper = Objects.requireNonNull(jsonMapper, "jsonMapper");
        this.transactionTtl = requirePositive(transactionTtl, "transactionTtl");
        this.authorizationCodeTtl = requirePositive(authorizationCodeTtl, "authorizationCodeTtl");
    }

    @Override
    public boolean createTransaction(LoginTransaction transaction) {
        return create(TRANSACTION_PREFIX + transaction.id(), transaction, transactionTtl);
    }

    @Override
    public Optional<LoginTransaction> find(String transactionId) {
        return read(TRANSACTION_PREFIX + requireKey(transactionId), LoginTransaction.class, false);
    }

    @Override
    public Optional<LoginTransaction> consumeTransaction(String transactionId) {
        return read(TRANSACTION_PREFIX + requireKey(transactionId), LoginTransaction.class, true);
    }

    @Override
    public void deleteTransaction(String transactionId) {
        bucket(TRANSACTION_PREFIX + requireKey(transactionId)).delete();
    }

    @Override
    public boolean createChallenge(String token, PasswordChangeChallenge challenge) {
        return create(PASSWORD_CHANGE_PREFIX + requireKey(token), challenge, transactionTtl);
    }

    @Override
    public Optional<PasswordChangeChallenge> consumeChallenge(String token) {
        return read(PASSWORD_CHANGE_PREFIX + requireKey(token), PasswordChangeChallenge.class, true);
    }

    @Override
    public boolean createCode(PlatformAuthorizationCode authorizationCode) {
        return create(CODE_PREFIX + authorizationCode.code(), authorizationCode, authorizationCodeTtl);
    }

    @Override
    public Optional<PlatformAuthorizationCode> consumeCode(String code) {
        return read(CODE_PREFIX + requireKey(code), PlatformAuthorizationCode.class, true);
    }

    @Override
    public void cancelCode(String code) {
        bucket(CODE_PREFIX + requireKey(code)).delete();
    }

    @Override
    public boolean createOidcState(OidcLoginState state) {
        return create(OIDC_PREFIX + state.state(), state, transactionTtl);
    }

    @Override
    public Optional<OidcLoginState> consumeOidcState(String state) {
        return read(OIDC_PREFIX + requireKey(state), OidcLoginState.class, true);
    }

    private boolean create(String key, Object value, Duration ttl) {
        try {
            return bucket(key).setIfAbsent(jsonMapper.writeValueAsString(value), ttl);
        } catch (Exception exception) {
            throw new IllegalStateException("Redis 认证状态序列化失败", exception);
        }
    }

    private <T> Optional<T> read(String key, Class<T> type, boolean consume) {
        String json = consume ? bucket(key).getAndDelete() : bucket(key).get();
        if (json == null) return Optional.empty();
        try {
            return Optional.of(jsonMapper.readValue(json, type));
        } catch (Exception exception) {
            throw new IllegalStateException("Redis 认证状态反序列化失败", exception);
        }
    }

    private RBucket<String> bucket(String key) {
        return redisson.getBucket(key, StringCodec.INSTANCE);
    }

    private static String requireKey(String value) {
        if (value == null || value.isBlank() || value.length() > 128) {
            throw new IllegalArgumentException("认证状态 key 非法");
        }
        return value;
    }

    private static Duration requirePositive(Duration value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isZero() || value.isNegative()) throw new IllegalArgumentException(name + " 必须为正数");
        return value;
    }
}
