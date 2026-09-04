/**
 * [INPUT]: 聚合 V3/V9 replica 行、owner/source device 显示事实与 header/title 密文。
 * [OUTPUT]: 对外提供 format v0、连续序列、32 字节 rolling hash 和 tombstone 不变量。
 * [POS]: session 领域聚合根；明文只在 application 临时解密，不进入列表持久化模型。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.domain;

import com.owndsh.enterprise.crypto.EncryptedSecret;

import java.time.Instant;
import java.util.Objects;

public record SessionReplica(
    long id,
    String tenantId,
    String sessionId,
    long ownerUserId,
    String ownerUsername,
    long sourceDeviceId,
    String sourceDeviceName,
    int formatVersion,
    int contentKeyVersion,
    EncryptedSecret header,
    EncryptedSecret title,
    long lastSeq,
    long eventCount,
    byte[] rollingHash,
    Status status,
    Instant createdAt,
    Instant updatedAt,
    Instant deletedAt
) {
    public static final int FORMAT_VERSION = 0;
    public static final int HASH_BYTES = 32;

    public SessionReplica {
        if (id <= 0 || ownerUserId <= 0 || sourceDeviceId <= 0) {
            throw new IllegalArgumentException("Session replica ID 必须为正数");
        }
        requireText(tenantId, "tenantId");
        requireText(sessionId, "sessionId");
        requireText(ownerUsername, "ownerUsername");
        requireText(sourceDeviceName, "sourceDeviceName");
        if (formatVersion != FORMAT_VERSION || contentKeyVersion != 1) {
            throw new IllegalArgumentException("Session 格式或密钥版本非法");
        }
        if (lastSeq < -1 || eventCount != lastSeq + 1) {
            throw new IllegalArgumentException("Session 连续序列不变量损坏");
        }
        if (rollingHash == null || rollingHash.length != HASH_BYTES) {
            throw new IllegalArgumentException("rollingHash 必须为 32 字节");
        }
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (status == Status.ACTIVE) {
            Objects.requireNonNull(header, "ACTIVE Session 必须保留 header");
            if (deletedAt != null) throw new IllegalArgumentException("ACTIVE Session 不能有 deletedAt");
        } else if (header != null || title != null || deletedAt == null) {
            throw new IllegalArgumentException("tombstone 必须清空正文并记录 deletedAt");
        }
        rollingHash = rollingHash.clone();
    }

    @Override
    public byte[] rollingHash() {
        return rollingHash.clone();
    }

    public enum Status {
        ACTIVE,
        DELETED,
        EXPIRED
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }
}
