/**
 * [INPUT]: 依赖 Spring 装配的 OIDC/LDAP/LOCAL IdentityAdapter 集合。
 * [OUTPUT]: 对外提供按 IdentitySource.type 唯一路由的 authenticate/testConnection 与受限 LOCAL 首次改密。
 * [POS]: auth application 与具体 adapter 之间的路由边界，启动时拒绝重复或缺失类型并封装 LOCAL 实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.adapter;

import com.owndsh.enterprise.auth.domain.IdentityCredential;
import com.owndsh.enterprise.auth.domain.IdentityPrincipal;
import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 身份适配器注册表。
 */
public final class IdentityAdapterRegistry {
    private final Map<IdentitySourceType, IdentityAdapter> adapters;

    public IdentityAdapterRegistry(List<IdentityAdapter> adapters) {
        Objects.requireNonNull(adapters, "adapters");
        EnumMap<IdentitySourceType, IdentityAdapter> indexed = new EnumMap<>(IdentitySourceType.class);
        for (IdentityAdapter adapter : adapters) {
            if (indexed.put(adapter.type(), adapter) != null) {
                throw new IllegalArgumentException("重复身份适配器: " + adapter.type());
            }
        }
        if (indexed.size() != IdentitySourceType.values().length) {
            throw new IllegalArgumentException("OIDC、LDAP、LOCAL 身份适配器必须全部装配");
        }
        this.adapters = Map.copyOf(indexed);
    }

    public IdentityPrincipal authenticate(IdentitySource source, IdentityCredential credential) {
        if (source.status() != com.owndsh.enterprise.auth.domain.IdentitySourceStatus.ACTIVE) {
            throw new IdentityAuthenticationException();
        }
        return adapter(source).authenticate(source, credential);
    }

    public IdentitySourceConnection testConnection(IdentitySource source) {
        return adapter(source).testConnection(source);
    }

    public IdentityPrincipal changeInitialLocalPassword(
        IdentitySource source,
        long userId,
        String username,
        char[] newPassword
    ) {
        if (!(adapter(source) instanceof LocalIdentityAdapter local)) {
            throw new IdentityAuthenticationException();
        }
        return local.changeInitialPassword(source, userId, username, newPassword);
    }

    private IdentityAdapter adapter(IdentitySource source) {
        Objects.requireNonNull(source, "source");
        return adapters.get(source.type());
    }
}
