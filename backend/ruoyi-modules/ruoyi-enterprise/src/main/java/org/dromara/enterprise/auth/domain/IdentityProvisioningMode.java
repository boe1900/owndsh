/**
 * [INPUT]: 接收身份源对未知稳定 subject 的成员生命周期策略。
 * [OUTPUT]: 对外提供 JIT 与 LINK_ONLY 两种封闭 provisioning mode。
 * [POS]: auth/domain 的身份源生命周期事实，不承担认证或授权逻辑。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

public enum IdentityProvisioningMode {
    JIT,
    LINK_ONLY
}
