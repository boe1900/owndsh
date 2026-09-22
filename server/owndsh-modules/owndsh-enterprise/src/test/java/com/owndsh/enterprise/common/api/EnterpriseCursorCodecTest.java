/**
 * [INPUT]: 依赖 EnterpriseCursorCodec、SecretCipher 与固定时间/ID。
 * [OUTPUT]: 验证时间精度、空首屏、旧 ID 格式兼容及跨租户/筛选/格式和篡改拒绝。
 * [POS]: 公共游标信任边界的回归门禁，SQL 续页由各业务集成测试覆盖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import com.owndsh.enterprise.crypto.SecretCipher;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class EnterpriseCursorCodecTest {
    @Test
    void preservesPositionsAndRejectsRebindingOrTampering() {
        var codec = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        var position = new EnterpriseCursorCodec.TimePosition(Instant.parse("2026-09-20T12:00:00.123456Z"), 102);
        String cursor = codec.encodeTime("000000", "audit", position);
        assertThat(codec.decodeTime(null, "000000", "audit")).isNull();
        assertThat(codec.decodeTime(cursor, "000000", "audit")).isEqualTo(position);
        String legacy = codec.encode("000000", "audit", 102);
        assertThat(codec.decode(legacy, "000000", "audit")).isEqualTo(102);
        assertThatThrownBy(() -> codec.decodeTime(legacy, "000000", "audit")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decode(cursor, "000000", "audit")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decodeTime(cursor, "other", "audit")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decodeTime(cursor, "000000", "audit:failed")).isInstanceOf(IllegalArgumentException.class);
        byte[] bytes = Base64.getUrlDecoder().decode(cursor);
        bytes[bytes.length - 1] ^= 1;
        String tampered = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        assertThatThrownBy(() -> codec.decodeTime(tampered, "000000", "audit")).isInstanceOf(IllegalArgumentException.class);
    }
}
