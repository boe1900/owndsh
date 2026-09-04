/**
 * [INPUT]: 依赖详细设计冻结的 OIDC、LDAP、LOCAL 身份源集合。
 * [OUTPUT]: 对外提供封闭的 IdentitySourceType 枚举。
 * [POS]: auth 领域的适配器路由键，与数据库 type 检查约束同构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

/**
 * 企业身份源类型。
 */
public enum IdentitySourceType {
    OIDC,
    LDAP,
    LOCAL
}
