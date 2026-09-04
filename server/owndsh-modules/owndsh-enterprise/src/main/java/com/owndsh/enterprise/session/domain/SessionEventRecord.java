/**
 * [INPUT]: 接收单条 raw event line 的加密结果、事件索引字段与滚动 hash checkpoint。
 * [OUTPUT]: 对外提供可分页解密且不重序列化事件的不可变持久化值。
 * [POS]: session/domain 的事件密文单元；eventHash 表示包含当前事件后的 rolling hash。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.domain;

import com.owndsh.enterprise.crypto.EncryptedSecret;

import java.time.Instant;
import java.util.Objects;

public record SessionEventRecord(
    String tenantId,
    long replicaId,
    long seq,
    String eventType,
    Instant eventTime,
    EncryptedSecret content,
    byte[] eventHash
) {
    public SessionEventRecord {
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(eventTime, "eventTime");
        Objects.requireNonNull(content, "content");
        if (tenantId.isBlank() || replicaId <= 0 || seq < 0 || eventType.isBlank() || eventType.length() > 64) {
            throw new IllegalArgumentException("Session event 索引字段非法");
        }
        if (eventHash == null || eventHash.length != SessionReplica.HASH_BYTES) {
            throw new IllegalArgumentException("eventHash 必须为 32 字节");
        }
        eventHash = eventHash.clone();
    }

    @Override
    public byte[] eventHash() {
        return eventHash.clone();
    }
}
