/**
 * [INPUT]: 聚合一个内部构造的 EnterpriseError。
 * [OUTPUT]: 对外提供固定 error 失败 envelope。
 * [POS]: common/api 的失败响应根，与 EnterpriseResponse 形成封闭的 HTTP 顶层结构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import java.util.Objects;

/**
 * 企业 API 失败响应。
 */
public record EnterpriseErrorResponse(EnterpriseError error) {
    public EnterpriseErrorResponse {
        Objects.requireNonNull(error, "error");
    }
}
