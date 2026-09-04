/**
 * [INPUT]: 由 endpoint、claim 或 LDAP 稳定属性校验发现不安全或不完整配置。
 * [OUTPUT]: 对外提供不回显配置正文的 IdentitySourceConfigurationException。
 * [POS]: 身份源保存/测试的安全失败边界，与普通凭据失败区分但不泄漏秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

/**
 * 身份源配置不安全或不完整。
 */
public final class IdentitySourceConfigurationException extends RuntimeException {
    public IdentitySourceConfigurationException(String message) {
        super(message);
    }

    public IdentitySourceConfigurationException(String message, Throwable cause) {
        super(message, cause);
    }
}
