/**
 * [INPUT]: 依赖详细设计冻结的秘密用途与不透明 API cursor 用途名称。
 * [OUTPUT]: 对外提供 HKDF info 的封闭 SecretPurpose 枚举。
 * [POS]: crypto 模块的用途隔离边界，禁止调用方用任意字符串派生密钥。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.crypto;

import java.nio.charset.StandardCharsets;

/**
 * 允许派生的秘密用途。
 */
public enum SecretPurpose {
    IDENTITY_SECRET("identity-secret"),
    PROVIDER_SECRET("provider-secret"),
    SESSION_CONTENT("session-content"),
    API_CURSOR("api-cursor");

    private final byte[] info;

    SecretPurpose(String info) {
        this.info = info.getBytes(StandardCharsets.US_ASCII);
    }

    byte[] info() {
        return info.clone();
    }
}
