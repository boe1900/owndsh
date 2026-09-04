/**
 * [INPUT]: 接收已加载的 IdentitySource 与一种封闭 IdentityCredential。
 * [OUTPUT]: 对外提供类型路由、连接检查和只返回 IdentityPrincipal 的 authenticate 端口。
 * [POS]: auth 领域对 OIDC/LDAP/LOCAL 的 DIP 抽象，外部协议实现不得泄漏到调用方。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.adapter;

import com.owndsh.enterprise.auth.domain.IdentityCredential;
import com.owndsh.enterprise.auth.domain.IdentityPrincipal;
import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;

/**
 * 企业身份适配器。
 */
public interface IdentityAdapter {
    IdentitySourceType type();

    IdentityPrincipal authenticate(IdentitySource source, IdentityCredential credential);

    IdentitySourceConnection testConnection(IdentitySource source);
}
