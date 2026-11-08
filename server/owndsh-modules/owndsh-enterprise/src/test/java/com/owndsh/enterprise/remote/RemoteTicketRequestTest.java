/**
 * [INPUT]: 依赖 RemoteTicketRequest 的外部输入校验。
 * [OUTPUT]: 证明控制端 ID、公钥长度和能力集合在进入 Redis 前被拒绝或规范化。
 * [POS]: remote 的边界回归测试，覆盖安全输入而不依赖 Spring/Redis。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.application.RemoteTicketRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;

import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Tag("dev")
class RemoteTicketRequestTest {
    private static final String DEVICE = "ctl_01J8K8M4QJ9K4Y5W8R1T2P3N4M";
    private static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);

    @Test
    void acceptsTheFrozenControllerShape() {
        assertDoesNotThrow(() -> new RemoteTicketRequest(DEVICE, KEY, List.of("remote.connect"), "console/0.1.0"));
    }

    @Test
    void rejectsDuplicateCapabilities() {
        assertThrows(IllegalArgumentException.class, () -> new RemoteTicketRequest(
            DEVICE, KEY, List.of("remote.connect", "remote.connect"), "console/0.1.0"
        ));
    }

    @Test
    void rejectsNon32ByteControllerKeys() {
        String shortKey = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[31]);
        assertThrows(IllegalArgumentException.class, () -> new RemoteTicketRequest(
            DEVICE, shortKey, List.of("remote.connect"), "console/0.1.0"
        ));
    }
}
