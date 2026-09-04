/**
 * [INPUT]: 接收稳定错误码、用户安全消息、requestId、重试语义和显式 details DTO。
 * [OUTPUT]: 对外提供详细设计第 17 节 error 对象，null details 不参与序列化。
 * [POS]: common/api 的失败协议值，禁止承载异常、SQL、URL、Token 或任意 request map。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Objects;

/**
 * 企业 API 稳定错误。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EnterpriseError(
    String code,
    String message,
    String requestId,
    boolean retryable,
    Object details
) {
    public EnterpriseError {
        code = requireText(code, "code");
        message = requireText(message, "message");
        requestId = requireText(requestId, "requestId");
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
