/**
 * [INPUT]: 由身份适配器把外部协议、账号不存在、密码错误和停用状态归一化。
 * [OUTPUT]: 对外提供不包含用户名、密码、DN、Token 或 claims 的稳定认证异常。
 * [POS]: auth 的失败保密边界，T05 可统一映射响应而不枚举账号状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.adapter;

/**
 * 统一身份认证失败。
 */
public final class IdentityAuthenticationException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_AUTH_REQUIRED";

    public IdentityAuthenticationException() {
        super("身份认证失败");
    }

    public IdentityAuthenticationException(Throwable cause) {
        super("身份认证失败", cause);
    }

    public String errorCode() {
        return ERROR_CODE;
    }
}
