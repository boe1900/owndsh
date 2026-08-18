/**
 * [INPUT]: 接收企业 API 的白名单 data DTO 与当前 requestId。
 * [OUTPUT]: 对外提供固定 data/requestId 成功 envelope。
 * [POS]: common/api 的成功协议根，Controller 不得返回 RuoYi R 或裸领域对象。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

import java.util.Objects;

/**
 * 企业 API 成功响应。
 */
public record EnterpriseResponse<T>(T data, String requestId) {
    public EnterpriseResponse {
        Objects.requireNonNull(data, "data");
        requestId = requireText(requestId);
    }

    private static String requireText(String value) {
        Objects.requireNonNull(value, "requestId");
        if (value.isBlank()) throw new IllegalArgumentException("requestId 不能为空");
        return value;
    }
}
