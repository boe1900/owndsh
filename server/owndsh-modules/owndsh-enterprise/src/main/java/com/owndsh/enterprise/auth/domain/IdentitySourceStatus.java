/**
 * [INPUT]: 依赖身份源可用性只有 ACTIVE 与 DISABLED 两种持久化状态。
 * [OUTPUT]: 对外提供封闭的 IdentitySourceStatus 枚举。
 * [POS]: auth 领域的启停状态真源，与数据库 status 检查约束同构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

/**
 * 企业身份源状态。
 */
public enum IdentitySourceStatus {
    ACTIVE,
    DISABLED
}
