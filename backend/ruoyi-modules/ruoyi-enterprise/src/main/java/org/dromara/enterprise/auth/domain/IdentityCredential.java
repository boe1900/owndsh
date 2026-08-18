/**
 * [INPUT]: 由登录事务构造一种受控身份凭据，不接收任意 Map 或原始请求对象。
 * [OUTPUT]: 对外提供 PasswordCredentials 与 OidcCodeCredentials 的封闭 marker。
 * [POS]: auth adapter 的敏感输入边界，阻止跨协议凭据误投和日志意外展开。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

/**
 * 身份适配器凭据 marker。
 */
public sealed interface IdentityCredential permits PasswordCredentials, OidcCodeCredentials {
}
