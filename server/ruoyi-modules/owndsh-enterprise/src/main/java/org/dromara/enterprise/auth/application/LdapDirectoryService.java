/**
 * [INPUT]: 依赖 tenant 限定身份源、LdapIdentityAdapter 与 ExternalIdentityService 的稳定 subject 建号事务。
 * [OUTPUT]: 对外提供启用 LDAP 来源的有界用户/组搜索，以及按可信 DN 重读后的单人导入。
 * [POS]: auth/application 的 LDAP 管理用例边界；不保存目录镜像、不展开嵌套组、不信任浏览器回传属性。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.auth.adapter.LdapIdentityAdapter;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LdapDirectory;
import org.dromara.enterprise.auth.persistence.IdentitySourceStore;

import java.util.List;
import java.util.Objects;

public final class LdapDirectoryService {
    private final IdentitySourceStore sources;
    private final LdapIdentityAdapter ldap;
    private final ExternalIdentityService identities;

    public LdapDirectoryService(
        IdentitySourceStore sources,
        LdapIdentityAdapter ldap,
        ExternalIdentityService identities
    ) {
        this.sources = Objects.requireNonNull(sources, "sources");
        this.ldap = Objects.requireNonNull(ldap, "ldap");
        this.identities = Objects.requireNonNull(identities, "identities");
    }

    public List<LdapDirectory.User> searchUsers(String tenantId, long sourceId, String query, int limit) {
        return ldap.searchUsers(requireActiveLdap(tenantId, sourceId), query, limit);
    }

    public List<LdapDirectory.Group> searchGroups(String tenantId, long sourceId, String query, int limit) {
        return ldap.searchGroups(requireActiveLdap(tenantId, sourceId), query, limit);
    }

    public IdentityLinkResult importUser(IdentityMutationContext context, long sourceId, String dn) {
        IdentitySource source = requireActiveLdap(context.tenantId(), sourceId);
        return identities.importIdentity(context, ldap.readUser(source, dn));
    }

    private IdentitySource requireActiveLdap(String tenantId, long sourceId) {
        IdentitySource source = sources.find(tenantId, sourceId)
            .orElseThrow(IdentityResourceNotFoundException::new);
        if (source.type() != IdentitySourceType.LDAP || source.status() != IdentitySourceStatus.ACTIVE) {
            throw new IllegalArgumentException("身份源不是启用的 LDAP 来源");
        }
        return source;
    }
}
