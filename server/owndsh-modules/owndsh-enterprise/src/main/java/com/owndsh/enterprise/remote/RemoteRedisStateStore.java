/**
 * [INPUT]: 依赖 Redisson RScript 和 Remote ticket/lease/revoke key 约定。
 * [OUTPUT]: 提供一次性 ticket 绑定消费、lease acquire/renew/release、revoke epoch 与 presence TTL 的原子操作。
 * [POS]: remote 的 Redis 并发边界；业务 RPC 和正文永不进入 Redis。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import org.redisson.api.RScript;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

public final class RemoteRedisStateStore {
    private static final String CONSUME_TICKET = "local value = redis.call('GET', KEYS[1]); if value == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 end; return 0";
    private static final String RENEW_LEASE = "local owner = redis.call('GET', KEYS[1]); if owner ~= ARGV[1] then return 0 end; redis.call('PEXPIRE', KEYS[1], ARGV[2]); return 1";
    private static final String REVOKE_EPOCH = "return redis.call('INCR', KEYS[1])";
    private static final String PRESENCE = "redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]); return 1";
    private static final String ISSUE_TICKET = "local existing = redis.call('GET', KEYS[3]); "
        + "if existing then return existing end; "
        + "redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3]); "
        + "redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[3]); "
        + "redis.call('SET', KEYS[3], ARGV[2], 'PX', ARGV[3]); return ARGV[2]";
    private static final String REVOKE_LINK = "redis.call('DEL', KEYS[1]); redis.call('DEL', KEYS[2]); return redis.call('INCR', KEYS[3])";
    private static final String CONSUME_TICKET_STATE = "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); return value end; return nil";
    private static final String CONSUME_TICKET_STATE_BOUND = "local value = redis.call('GET', KEYS[1]); if not value then return nil end; "
        + "local state = cjson.decode(value); "
        + "if state.tenantId ~= ARGV[1] or tostring(state.actorId) ~= ARGV[2] or state.linkId ~= ARGV[3] "
        + "or state.deviceId ~= ARGV[4] or state.controllerDeviceId ~= ARGV[5] or state.controllerPublicKey ~= ARGV[6] then return nil end; "
        + "redis.call('DEL', KEYS[1]); return value";
    private static final String ACQUIRE_LEASE = "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end; redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX'); return 1";
    private static final String RELEASE_LEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0";
    private final RedissonClient redisson;

    public RemoteRedisStateStore(RedissonClient redisson) { this.redisson = redisson; }

    public String issueTicket(
        String ticketKey,
        String linkKey,
        String idempotencyKey,
        String ticketState,
        String idempotencyState,
        Duration ttl
    ) {
        if (ttl.isNegative() || ttl.isZero()) throw new IllegalArgumentException("Remote ticket TTL must be positive");
        Object result = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE,
            ISSUE_TICKET,
            RScript.ReturnType.VALUE,
            List.of(ticketKey, linkKey, idempotencyKey),
            ticketState,
            idempotencyState,
            Long.toString(ttl.toMillis())
        );
        return result == null ? idempotencyState : result.toString();
    }

    public Optional<String> read(String key) {
        return Optional.ofNullable(bucket(key).get());
    }

    public Optional<String> consumeTicketState(String key) {
        Object result = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE, CONSUME_TICKET_STATE, RScript.ReturnType.VALUE, List.of(key)
        );
        return Optional.ofNullable(result).map(Object::toString);
    }

    public Optional<String> consumeTicketStateBound(
        String key,
        String tenantId,
        long actorId,
        String linkId,
        String deviceId,
        String controllerId,
        String controllerPublicKey
    ) {
        Object result = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE,
            CONSUME_TICKET_STATE_BOUND,
            RScript.ReturnType.VALUE,
            List.of(key),
            tenantId,
            Long.toString(actorId),
            linkId,
            deviceId,
            controllerId,
            controllerPublicKey
        );
        return Optional.ofNullable(result).map(Object::toString);
    }

    public boolean acquireLease(String key, String leaseId, long ttlMillis) {
        if (ttlMillis < 1) throw new IllegalArgumentException("Remote lease TTL must be positive");
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE, ACQUIRE_LEASE, RScript.ReturnType.LONG, List.of(key), leaseId, Long.toString(ttlMillis)
        );
        return Long.valueOf(1).equals(result);
    }

    public boolean releaseLease(String key, String leaseId) {
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE, RELEASE_LEASE, RScript.ReturnType.LONG, List.of(key), leaseId
        );
        return Long.valueOf(1).equals(result);
    }

    public long revokeLink(String linkKey, String leaseKey, String epochKey) {
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE,
            REVOKE_LINK,
            RScript.ReturnType.LONG,
            List.of(linkKey, leaseKey, epochKey)
        );
        return result == null ? 0 : result;
    }

    public boolean consumeTicket(String key, String ticket) {
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE, CONSUME_TICKET, RScript.ReturnType.LONG, List.of(key), ticket);
        return Long.valueOf(1).equals(result);
    }

    public boolean renewLease(String key, String leaseId, long ttlMillis) {
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE, RENEW_LEASE, RScript.ReturnType.LONG, List.of(key), leaseId, Long.toString(ttlMillis));
        return Long.valueOf(1).equals(result);
    }

    public long revokeEpoch(String key) {
        Long result = redisson.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE, REVOKE_EPOCH, RScript.ReturnType.LONG, List.of(key));
        return result == null ? 0 : result;
    }

    public void updatePresence(String key, String state, long ttlMillis) {
        redisson.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE, PRESENCE, RScript.ReturnType.LONG, List.of(key), state, Long.toString(ttlMillis));
    }

    private RBucket<String> bucket(String key) {
        return redisson.getBucket(key, StringCodec.INSTANCE);
    }
}
