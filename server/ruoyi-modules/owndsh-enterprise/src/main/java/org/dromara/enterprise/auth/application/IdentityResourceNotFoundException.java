/**
 * [INPUT]: 由 tenant 限定的身份资源查询无结果时提供稳定资源类型。
 * [OUTPUT]: 对外提供可映射 ENT_RESOURCE_NOT_FOUND 且不泄漏跨 tenant 存在性的异常。
 * [POS]: identity application 的资源边界，统一身份源与组映射不存在语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

/**
 * 身份资源不存在。
 */
public final class IdentityResourceNotFoundException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_RESOURCE_NOT_FOUND";

    public IdentityResourceNotFoundException() {
        super("身份资源不存在");
    }

    public String errorCode() {
        return ERROR_CODE;
    }
}
