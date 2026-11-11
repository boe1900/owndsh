/**
 * [INPUT]: 依赖 Redisson 与 ticket/link/consumed/lease/revoke key 约定。
 * [OUTPUT]: 原子签发、绑定消费、lease 操作与撤权及当前 Host presence；续租同时延长授权事实，避免长连接失去 link 状态。
 * [POS]: remote 的 Redis 并发边界；数据库资格由应用层重验，业务正文永不进入 Redis。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import org.redisson.api.RScript;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

public final class RemoteRedisStateStore {
    private static final String ISSUE_TICKET = """
        local existing = redis.call('GET', KEYS[3])
        if existing then return existing end
        redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
        redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[3])
        redis.call('SET', KEYS[3], ARGV[2], 'PX', ARGV[3])
        return ARGV[2]
        """;
    private static final String CONSUME_TICKET = """
        if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
        local ttl = redis.call('PTTL', KEYS[2])
        if ttl <= 0 then return 0 end
        redis.call('DEL', KEYS[1])
        redis.call('SET', KEYS[2], ARGV[2], 'PX', ttl)
        redis.call('SET', KEYS[3], '1', 'PX', ttl)
        return 1
        """;
    private static final String ACQUIRE_LEASE = """
        if redis.call('GET', KEYS[2]) ~= ARGV[3] or redis.call('GET', KEYS[3]) ~= '1' then return 0 end
        if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
        redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
        redis.call('PEXPIRE', KEYS[2], ARGV[4])
        redis.call('SET', KEYS[3], 'leased', 'PX', ARGV[4])
        return 1
        """;
    private static final String RENEW_LEASE = """
        if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('GET', KEYS[2]) ~= ARGV[3]
            or redis.call('GET', KEYS[3]) ~= 'leased' then return 0 end
        redis.call('PEXPIRE', KEYS[1], ARGV[2])
        redis.call('PEXPIRE', KEYS[2], ARGV[4])
        redis.call('PEXPIRE', KEYS[3], ARGV[4])
        return 1
        """;
    private static final String RELEASE_LEASE = """
        if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
        return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
        """;
    private static final String REVOKE_LINK = """
        redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
        local epoch = redis.call('INCR', KEYS[4])
        redis.call('PEXPIRE', KEYS[4], 90000)
        return epoch
        """;
    private final RedissonClient redisson;

    public RemoteRedisStateStore(RedissonClient redisson) { this.redisson = redisson; }

    public String issueTicket(String ticketKey, String linkKey, String idempotencyKey,
                              String ticketState, String idempotencyState, Duration ttl) {
        return redisson.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE, ISSUE_TICKET,
            RScript.ReturnType.VALUE, List.of(ticketKey, linkKey, idempotencyKey),
            ticketState, idempotencyState, Long.toString(ttl.toMillis()));
    }

    public Optional<String> read(String key) {
        return Optional.ofNullable(redisson.<String>getBucket(key, StringCodec.INSTANCE).get());
    }

    public boolean consumeTicket(String ticketKey, String linkId, String expectedState, String boundState) {
        return execute(CONSUME_TICKET, List.of(ticketKey, "remote:link:" + linkId, "remote:consumed:" + linkId),
            expectedState, boundState);
    }

    public boolean acquireLease(String linkId, String leaseId, String expectedState, long ttlMillis) {
        return execute(ACQUIRE_LEASE, linkKeys(linkId), leaseId, Long.toString(ttlMillis), expectedState,
            Long.toString(ttlMillis + 30_000));
    }

    public boolean renewLease(String linkId, String leaseId, String expectedState, long ttlMillis) {
        return execute(RENEW_LEASE, linkKeys(linkId), leaseId, Long.toString(ttlMillis), expectedState,
            Long.toString(ttlMillis + 30_000));
    }

    public void releaseLease(String linkId, String leaseId) {
        execute(RELEASE_LEASE, linkKeys(linkId), leaseId);
    }

    public long revokeLink(String linkId) {
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE, REVOKE_LINK,
            RScript.ReturnType.LONG, List.of("remote:link:" + linkId, "remote:lease:" + linkId,
                "remote:consumed:" + linkId, "remote:revoke:" + linkId));
        return result;
    }

    public void removePresence(String deviceId) {
        redisson.getBucket("remote:presence:" + deviceId).delete();
    }

    public void updatePresence(String key, String state, long ttlMillis) {
        redisson.getBucket(key, StringCodec.INSTANCE).set(state, Duration.ofMillis(ttlMillis));
    }

    private boolean execute(String script, List<Object> keys, Object... arguments) {
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE, script, RScript.ReturnType.LONG, keys, arguments);
        return Long.valueOf(1).equals(result);
    }

    private static List<Object> linkKeys(String linkId) {
        return List.of("remote:lease:" + linkId, "remote:link:" + linkId, "remote:consumed:" + linkId);
    }
}
