/**
 * [INPUT]: 依赖真实 OpenLDAP StartTLS 容器、JNDI LdapIdentityAdapter 和 AES-GCM manager secret。
 * [OUTPUT]: 验证双 bind、稳定 subject、用户/组发现、DN 重读、权威空组及 filter 注入防护。
 * [POS]: T04 LDAP adapter 集成验收，不用 mock 替代目录协议和 TLS 行为。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.dromara.enterprise.auth.adapter.IdentityAuthenticationException;
import org.dromara.enterprise.auth.adapter.IdentityEndpointPolicy;
import org.dromara.enterprise.auth.adapter.IdentitySourceConfigurationException;
import org.dromara.enterprise.auth.adapter.LdapFilterEscaper;
import org.dromara.enterprise.auth.adapter.LdapIdentityAdapter;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LdapSettings;
import org.dromara.enterprise.auth.domain.PasswordCredentials;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretPurpose;
import org.dromara.enterprise.test.OpenLdapTestServer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class LdapIdentityAdapterTest {
    private static LdapIdentityAdapter adapter;
    private static IdentitySource source;

    @BeforeAll
    static void setUp() {
        SecretCipher cipher = new SecretCipher(new byte[32]);
        long sourceId = 7300000000000000200L;
        EncryptedSecret encrypted = cipher.encrypt(
            SecretPurpose.IDENTITY_SECRET,
            new SecretAad("000000", "ent_identity_source", Long.toString(sourceId), "secret_ciphertext", 1),
            OpenLdapTestServer.MANAGER_PASSWORD.getBytes(StandardCharsets.UTF_8)
        );
        LdapSettings settings = new LdapSettings(
            URI.create(OpenLdapTestServer.url()),
            OpenLdapTestServer.BASE_DN,
            OpenLdapTestServer.MANAGER_DN,
            "(uid={0})",
            "entryUUID",
            "uid",
            "cn",
            "mail",
            "seeAlso",
            "ou=groups," + OpenLdapTestServer.BASE_DN,
            "(objectClass=groupOfNames)",
            "cn",
            true
        );
        Instant now = Instant.parse("2026-08-18T00:00:00Z");
        source = new IdentitySource(
            sourceId,
            "000000",
            IdentitySourceType.LDAP,
            "OpenLDAP",
            null,
            null,
            encrypted,
            null,
            settings,
            IdentitySourceStatus.ACTIVE,
            0,
            now,
            now
        );
        adapter = new LdapIdentityAdapter(
            cipher,
            new IdentityEndpointPolicy(false),
            OpenLdapTestServer.trustAllSocketFactory()
        );
    }

    @Test
    void authenticatesWithManagerSearchAndUserBindUsingStableEntryUuid() {
        IdentityPrincipal first = authenticate("alice", "ldap-password-73");
        IdentityPrincipal second = authenticate("alice", "ldap-password-73");

        assertThat(first.externalSubject()).isEqualTo(second.externalSubject()).isNotEqualTo("alice");
        assertThat(first.username()).isEqualTo("alice");
        assertThat(first.displayName()).isEqualTo("Alice LDAP");
        assertThat(first.email()).isEqualTo("alice.ldap@example.org");
        assertThat(first.externalGroups()).contains("cn=engineering,ou=groups,dc=example,dc=org");
        assertThat(adapter.testConnection(source).ok()).isTrue();
    }

    @Test
    void discoversUsersAndGroupsAndReadsSelectedUserByDn() {
        List<org.dromara.enterprise.auth.domain.LdapDirectory.User> users = adapter.searchUsers(source, "Alice", 50);
        assertThat(users).singleElement().satisfies(user -> {
            assertThat(user.dn()).isEqualTo("uid=alice,ou=people,dc=example,dc=org");
            assertThat(user.principal().username()).isEqualTo("alice");
            assertThat(adapter.readUser(source, user.dn()).externalSubject())
                .isEqualTo(user.principal().externalSubject());
        });
        assertThat(adapter.searchGroups(source, "engineer", 50)).singleElement().satisfies(group -> {
            assertThat(group.displayName()).isEqualTo("engineering");
            assertThat(group.dn()).isEqualTo("cn=engineering,ou=groups,dc=example,dc=org");
            assertThatThrownBy(() -> adapter.readUser(source, group.dn()))
                .isInstanceOf(IdentitySourceConfigurationException.class)
                .hasMessage("LDAP DN 不匹配用户过滤器");
        });
        assertThat(adapter.searchUsers(source, "engineering", 50)).isEmpty();
        assertThat(adapter.searchUsers(source, "alice*)(uid=*)", 50)).isEmpty();
    }

    @Test
    void configuredGroupAttributeTreatsMissingValueAsAuthoritativeEmptySet() {
        assertThat(adapter.searchUsers(source, "bob", 50)).singleElement().satisfies(user -> {
            assertThat(user.principal().externalGroupsPresent()).isTrue();
            assertThat(user.principal().externalGroups()).isEmpty();
        });
    }

    @Test
    void rejectsWrongPasswordAndEscapesInjectedFilterValues() {
        assertThatThrownBy(() -> authenticate("alice", "wrong-password"))
            .isInstanceOf(IdentityAuthenticationException.class)
            .hasMessage("身份认证失败");

        String injected = "alice*)(uid=*)";
        assertThat(LdapFilterEscaper.escape(injected)).isEqualTo("alice\\2a\\29\\28uid=\\2a\\29");
        assertThatThrownBy(() -> authenticate(injected, "ldap-password-73"))
            .isInstanceOf(IdentityAuthenticationException.class);
    }

    @Test
    void rejectsAmbiguousLdapsPlusStartTlsConfiguration() {
        LdapSettings ambiguous = new LdapSettings(
            URI.create("ldaps://directory.example.org:636"),
            "dc=example,dc=org",
            "cn=manager,dc=example,dc=org",
            "(uid={0})",
            "entryUUID",
            "uid",
            "cn",
            "mail",
            "ou",
            "ou=groups,dc=example,dc=org",
            "(objectClass=groupOfNames)",
            "cn",
            true
        );

        assertThatThrownBy(() -> new IdentityEndpointPolicy(false).requireLdap(ambiguous))
            .isInstanceOf(IdentitySourceConfigurationException.class);
    }

    private static IdentityPrincipal authenticate(String username, String password) {
        try (PasswordCredentials credentials = new PasswordCredentials(username, password.toCharArray())) {
            return adapter.authenticate(source, credentials);
        }
    }
}
