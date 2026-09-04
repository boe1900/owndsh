/**
 * [INPUT]: 接收 ACTIVE IdentitySource 的公开 id/name/type 投影。
 * [OUTPUT]: 对外提供登录选择页唯一可见的身份源字段。
 * [POS]: auth application 的秘密隔离 DTO，不携带 issuer、LDAP 配置、client ID 或 secret 状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;

public record PublicIdentitySource(long id, String name, IdentitySourceType type) {
    public static PublicIdentitySource from(IdentitySource source) {
        return new PublicIdentitySource(source.id(), source.name(), source.type());
    }
}
