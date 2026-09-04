/**
 * [INPUT]: 聚合 ent_replication_batch 的幂等键、设备、连续范围和两个 SHA-256。
 * [OUTPUT]: 对外提供可判定完整重复请求的不可变批次成功事实。
 * [POS]: session/domain 的幂等终态，不保存 header、title 或事件正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.domain;

import java.time.Instant;
import java.util.Objects;

public record SessionReplicationBatch(
    long id,
    String tenantId,
    long replicaId,
    long deviceId,
    String idempotencyKey,
    long fromSeq,
    long toSeq,
    byte[] payloadSha256,
    byte[] resultHash,
    Instant createdAt
) {
    public SessionReplicationBatch {
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(createdAt, "createdAt");
        if (id <= 0 || replicaId <= 0 || deviceId <= 0 || tenantId.isBlank()
            || idempotencyKey.isBlank() || fromSeq < 0 || toSeq < fromSeq) {
            throw new IllegalArgumentException("Session replication batch 非法");
        }
        requireHash(payloadSha256, "payloadSha256");
        requireHash(resultHash, "resultHash");
        payloadSha256 = payloadSha256.clone();
        resultHash = resultHash.clone();
    }

    @Override
    public byte[] payloadSha256() {
        return payloadSha256.clone();
    }

    @Override
    public byte[] resultHash() {
        return resultHash.clone();
    }

    private static void requireHash(byte[] value, String name) {
        if (value == null || value.length != SessionReplica.HASH_BYTES) {
            throw new IllegalArgumentException(name + " 必须为 32 字节");
        }
    }
}
