/**
 * [INPUT]: 对齐 DeepSeek Harness 自定义提供商的 wire protocol 标识。
 * [OUTPUT]: 对外提供 Harness 自定义路由支持的三种 API 协议及严格字符串转换。
 * [POS]: model/domain 的上游 API 协议真源，避免提供商来源类型与传输协议混为一谈。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.domain;

public enum ProviderApiProtocol {
    OPENAI_COMPLETIONS("openai-completions"),
    OPENAI_RESPONSES("openai-responses"),
    ANTHROPIC_MESSAGES("anthropic-messages");

    private final String value;

    ProviderApiProtocol(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static ProviderApiProtocol fromValue(String value) {
        for (ProviderApiProtocol protocol : values()) {
            if (protocol.value.equals(value)) return protocol;
        }
        throw new IllegalArgumentException("apiProtocol 不受支持");
    }
}
