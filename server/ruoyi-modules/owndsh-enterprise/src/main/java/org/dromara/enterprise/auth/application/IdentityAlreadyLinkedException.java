/**
 * [INPUT]: 由稳定 subject 或同源 user 唯一约束发现绑定目标冲突。
 * [OUTPUT]: 对外提供稳定错误码 ENT_IDENTITY_ALREADY_LINKED 的领域异常。
 * [POS]: external identity 并发/误绑定到 HTTP 409 的安全边界，不透露冲突用户信息。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

/**
 * 外部身份已经绑定到不兼容目标。
 */
public final class IdentityAlreadyLinkedException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_IDENTITY_ALREADY_LINKED";

    public IdentityAlreadyLinkedException() {
        super("外部身份已绑定");
    }

    public String errorCode() {
        return ERROR_CODE;
    }
}
