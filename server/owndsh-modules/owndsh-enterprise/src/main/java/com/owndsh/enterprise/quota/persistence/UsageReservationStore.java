/**
 * [INPUT]: 接收 reservation、用户幂等键、状态迁移与恢复截止时间。
 * [OUTPUT]: 对外提供唯一插入、行锁、状态 CAS 和 SKIP LOCKED 过期领取端口。
 * [POS]: quota/application 的预留持久化抽象，数据库唯一约束兜底并发幂等。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import com.owndsh.enterprise.quota.domain.ReservationState;
import com.owndsh.enterprise.quota.domain.UsageReservation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UsageReservationStore {
    void insert(UsageReservation reservation);

    Optional<UsageReservation> findByUserAndIdempotency(long userId, UUID idempotencyKey);

    Optional<UsageReservation> find(UUID id);

    UsageReservation lock(UUID id);

    boolean transition(UUID id, ReservationState expected, ReservationState target, Instant expiresAt);

    List<UsageReservation> lockExpired(Instant before, int limit);
}
