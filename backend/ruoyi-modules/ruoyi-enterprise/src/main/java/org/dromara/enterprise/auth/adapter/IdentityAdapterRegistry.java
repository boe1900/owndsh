/**
 * [INPUT]: 依赖 Spring 装配的 OIDC/LDAP/LOCAL IdentityAdapter 集合。
 * [OUTPUT]: 对外提供按 IdentitySource.type 唯一路由的 authenticate/testConnection。
 * [POS]: auth application 与具体 adapter 之间的路由边界，启动时拒绝重复或缺失类型。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import org.dromara.enterprise.auth.domain.IdentityCredential;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceType;

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
        if (source.status() != org.dromara.enterprise.auth.domain.IdentitySourceStatus.ACTIVE) {
            throw new IdentityAuthenticationException();
        }
        return adapter(source).authenticate(source, credential);
    }

    public IdentitySourceConnection testConnection(IdentitySource source) {
        return adapter(source).testConnection(source);
    }

    private IdentityAdapter adapter(IdentitySource source) {
        Objects.requireNonNull(source, "source");
        return adapters.get(source.type());
    }
}
