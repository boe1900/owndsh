/**
 * [INPUT]: 依赖 JNDI manager search/user bind、StartTLS/LDAPS、SecretCipher 与 RFC 4515 转义。
 * [OUTPUT]: 对外提供 LDAP/AD 稳定属性认证、最多 50 条用户/组发现和 userFilter 约束的 DN 重读。
 * [POS]: IdentityAdapter 的 LDAP 实现，manager/user 密码和原始 Attributes 不越过方法边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import org.dromara.enterprise.auth.domain.IdentityCredential;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LdapDirectory;
import org.dromara.enterprise.auth.domain.LdapSettings;
import org.dromara.enterprise.auth.domain.PasswordCredentials;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretPurpose;

import javax.naming.Context;
import javax.naming.NamingEnumeration;
import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.SearchControls;
import javax.naming.directory.SearchResult;
import javax.naming.ldap.InitialLdapContext;
import javax.naming.ldap.LdapContext;
import javax.naming.ldap.LdapName;
import javax.naming.ldap.StartTlsRequest;
import javax.naming.ldap.StartTlsResponse;
import javax.net.ssl.SSLSocketFactory;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.Hashtable;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/**
 * JNDI LDAP/Active Directory 身份适配器。
 */
public final class LdapIdentityAdapter implements IdentityAdapter {
    private static final String LDAP_FACTORY = "com.sun.jndi.ldap.LdapCtxFactory";
    private static final String CONNECT_TIMEOUT = "5000";
    private static final String READ_TIMEOUT = "10000";

    private final SecretCipher secretCipher;
    private final IdentityEndpointPolicy endpointPolicy;
    private final SSLSocketFactory tlsSocketFactory;

    public LdapIdentityAdapter(SecretCipher secretCipher, IdentityEndpointPolicy endpointPolicy) {
        this(secretCipher, endpointPolicy, (SSLSocketFactory) SSLSocketFactory.getDefault());
    }

    public LdapIdentityAdapter(
        SecretCipher secretCipher,
        IdentityEndpointPolicy endpointPolicy,
        SSLSocketFactory tlsSocketFactory
    ) {
        this.secretCipher = Objects.requireNonNull(secretCipher, "secretCipher");
        this.endpointPolicy = Objects.requireNonNull(endpointPolicy, "endpointPolicy");
        this.tlsSocketFactory = Objects.requireNonNull(tlsSocketFactory, "tlsSocketFactory");
    }

    @Override
    public IdentitySourceType type() {
        return IdentitySourceType.LDAP;
    }

    @Override
    public IdentityPrincipal authenticate(IdentitySource source, IdentityCredential credential) {
        requireSource(source);
        if (!(credential instanceof PasswordCredentials passwordCredentials)) {
            throw new IdentityAuthenticationException();
        }
        LdapSettings settings = source.ldap();
        endpointPolicy.requireLdap(settings);
        byte[] managerPassword = decryptSecret(source);
        char[] userPassword = passwordCredentials.password();
        try {
            SearchResult user = searchUser(settings, managerPassword, passwordCredentials.username());
            bind(settings, user.getNameInNamespace(), userPassword);
            return toPrincipal(source, settings, user.getAttributes());
        } catch (IdentitySourceConfigurationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IdentityAuthenticationException(exception);
        } finally {
            Arrays.fill(managerPassword, (byte) 0);
            Arrays.fill(userPassword, '\0');
        }
    }

    @Override
    public IdentitySourceConnection testConnection(IdentitySource source) {
        requireSource(source);
        LdapSettings settings = source.ldap();
        endpointPolicy.requireLdap(settings);
        byte[] managerPassword = decryptSecret(source);
        try (LdapSession ignored = open(settings, settings.managerDn(), new String(managerPassword, StandardCharsets.UTF_8))) {
            return IdentitySourceConnection.ready(type());
        } catch (Exception exception) {
            throw new IdentitySourceConfigurationException("LDAP 连接测试失败", exception);
        } finally {
            Arrays.fill(managerPassword, (byte) 0);
        }
    }

    public List<LdapDirectory.User> searchUsers(IdentitySource source, String query, int limit) {
        requireSource(source);
        requireSearch(query, limit);
        LdapSettings settings = source.ldap();
        endpointPolicy.requireLdap(settings);
        byte[] managerPassword = decryptSecret(source);
        try (LdapSession session = open(
            settings, settings.managerDn(), new String(managerPassword, StandardCharsets.UTF_8)
        )) {
            String value = "*" + LdapFilterEscaper.escape(query.strip()) + "*";
            String filter = userSearchFilter(settings, value);
            List<LdapDirectory.User> users = new ArrayList<>();
            NamingEnumeration<SearchResult> results = session.context().search(
                settings.baseDn(), filter, searchControls(limit, returningAttributes(settings))
            );
            try {
                while (results.hasMore()) {
                    SearchResult result = results.next();
                    users.add(new LdapDirectory.User(
                        result.getNameInNamespace(), toPrincipal(source, settings, result.getAttributes())
                    ));
                }
            } finally {
                results.close();
            }
            return users.stream()
                .sorted(Comparator.comparing(user -> user.principal().username(), String.CASE_INSENSITIVE_ORDER))
                .toList();
        } catch (IdentitySourceConfigurationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IdentitySourceConfigurationException("LDAP 用户搜索失败", exception);
        } finally {
            Arrays.fill(managerPassword, (byte) 0);
        }
    }

    public List<LdapDirectory.Group> searchGroups(IdentitySource source, String query, int limit) {
        requireSource(source);
        requireSearch(query, limit);
        LdapSettings settings = source.ldap();
        endpointPolicy.requireLdap(settings);
        byte[] managerPassword = decryptSecret(source);
        try (LdapSession session = open(
            settings, settings.managerDn(), new String(managerPassword, StandardCharsets.UTF_8)
        )) {
            String filter = "(&" + settings.groupFilter() + "(" + settings.groupNameAttribute()
                + "=*" + LdapFilterEscaper.escape(query.strip()) + "*))";
            List<LdapDirectory.Group> groups = new ArrayList<>();
            NamingEnumeration<SearchResult> results = session.context().search(
                settings.groupBaseDn(), filter,
                searchControls(limit, new String[]{settings.groupNameAttribute()})
            );
            try {
                while (results.hasMore()) {
                    SearchResult result = results.next();
                    groups.add(new LdapDirectory.Group(
                        result.getNameInNamespace(),
                        stringValue(requiredAttribute(result.getAttributes(), settings.groupNameAttribute()))
                    ));
                }
            } finally {
                results.close();
            }
            return groups.stream()
                .sorted(Comparator.comparing(LdapDirectory.Group::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
        } catch (IdentitySourceConfigurationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IdentitySourceConfigurationException("LDAP 组搜索失败", exception);
        } finally {
            Arrays.fill(managerPassword, (byte) 0);
        }
    }

    public IdentityPrincipal readUser(IdentitySource source, String dn) {
        requireSource(source);
        LdapSettings settings = source.ldap();
        endpointPolicy.requireLdap(settings);
        requireDescendantDn(dn, settings.baseDn());
        byte[] managerPassword = decryptSecret(source);
        try (LdapSession session = open(
            settings, settings.managerDn(), new String(managerPassword, StandardCharsets.UTF_8)
        )) {
            SearchControls controls = searchControls(1, returningAttributes(settings));
            controls.setSearchScope(SearchControls.OBJECT_SCOPE);
            NamingEnumeration<SearchResult> results = session.context().search(
                dn, settings.userFilter().replace("{0}", "*"), controls
            );
            try {
                if (!results.hasMore()) throw new IdentitySourceConfigurationException("LDAP DN 不匹配用户过滤器");
                return toPrincipal(source, settings, results.next().getAttributes());
            } finally {
                results.close();
            }
        } catch (IdentitySourceConfigurationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IdentitySourceConfigurationException("LDAP 用户读取失败", exception);
        } finally {
            Arrays.fill(managerPassword, (byte) 0);
        }
    }

    private SearchResult searchUser(LdapSettings settings, byte[] managerPassword, String username)
        throws NamingException {
        String filter = settings.userFilter().replace("{0}", LdapFilterEscaper.escape(username));
        SearchControls controls = searchControls(2, returningAttributes(settings));
        try (LdapSession session = open(
            settings,
            settings.managerDn(),
            new String(managerPassword, StandardCharsets.UTF_8)
        )) {
            NamingEnumeration<SearchResult> results = session.context().search(settings.baseDn(), filter, controls);
            try {
                if (!results.hasMore()) throw new IdentityAuthenticationException();
                SearchResult result = results.next();
                if (results.hasMore()) throw new IdentityAuthenticationException();
                return result;
            } finally {
                results.close();
            }
        }
    }

    private void bind(LdapSettings settings, String userDn, char[] password) throws NamingException {
        try (LdapSession ignored = open(settings, userDn, new String(password))) {
            // 建立并关闭用户 bind 即完成密码校验。
        }
    }

    private LdapSession open(LdapSettings settings, String principal, String credential) throws NamingException {
        Hashtable<String, Object> environment = baseEnvironment(settings);
        if (!settings.startTls()) {
            environment.put(Context.SECURITY_AUTHENTICATION, "simple");
            environment.put(Context.SECURITY_PRINCIPAL, principal);
            environment.put(Context.SECURITY_CREDENTIALS, credential);
            return new LdapSession(new InitialLdapContext(environment, null), null);
        }

        LdapContext context = new InitialLdapContext(environment, null);
        StartTlsResponse tls = null;
        try {
            tls = (StartTlsResponse) context.extendedOperation(new StartTlsRequest());
            tls.negotiate(tlsSocketFactory);
            context.addToEnvironment(Context.SECURITY_AUTHENTICATION, "simple");
            context.addToEnvironment(Context.SECURITY_PRINCIPAL, principal);
            context.addToEnvironment(Context.SECURITY_CREDENTIALS, credential);
            context.reconnect(null);
            return new LdapSession(context, tls);
        } catch (Exception exception) {
            closeQuietly(tls, context);
            if (exception instanceof NamingException namingException) throw namingException;
            NamingException wrapped = new NamingException("StartTLS negotiation failed");
            wrapped.initCause(exception);
            throw wrapped;
        }
    }

    private static Hashtable<String, Object> baseEnvironment(LdapSettings settings) {
        Hashtable<String, Object> environment = new Hashtable<>();
        environment.put(Context.INITIAL_CONTEXT_FACTORY, LDAP_FACTORY);
        environment.put(Context.PROVIDER_URL, settings.url().toString());
        environment.put("com.sun.jndi.ldap.connect.timeout", CONNECT_TIMEOUT);
        environment.put("com.sun.jndi.ldap.read.timeout", READ_TIMEOUT);
        environment.put(Context.REFERRAL, "ignore");
        return environment;
    }

    private IdentityPrincipal toPrincipal(IdentitySource source, LdapSettings settings, Attributes attributes)
        throws NamingException {
        String stableSubject = stableValue(requiredAttribute(attributes, settings.stableIdAttribute()));
        String username = stringValue(requiredAttribute(attributes, settings.usernameAttribute()));
        String displayName = stringValue(requiredAttribute(attributes, settings.displayNameAttribute()));
        String email = optionalString(attributes, settings.emailAttribute());
        List<String> groups = values(attributes, settings.groupAttribute());
        return new IdentityPrincipal(
            Long.toString(source.id()),
            type(),
            stableSubject,
            username,
            displayName,
            email,
            groups,
            settings.groupAttribute() != null
        );
    }

    private static SearchControls searchControls(int limit, String[] attributes) {
        SearchControls controls = new SearchControls();
        controls.setSearchScope(SearchControls.SUBTREE_SCOPE);
        controls.setCountLimit(limit);
        controls.setTimeLimit(Integer.parseInt(READ_TIMEOUT));
        controls.setReturningAttributes(attributes);
        return controls;
    }

    private static String userSearchFilter(LdapSettings settings, String value) {
        LinkedHashSet<String> filters = new LinkedHashSet<>();
        filters.add("(" + settings.usernameAttribute() + "=" + value + ")");
        filters.add("(" + settings.displayNameAttribute() + "=" + value + ")");
        if (settings.emailAttribute() != null) filters.add("(" + settings.emailAttribute() + "=" + value + ")");
        return "(&" + settings.userFilter().replace("{0}", "*")
            + "(|" + String.join("", filters) + "))";
    }

    private static void requireSearch(String query, int limit) {
        if (query == null || query.isBlank() || query.strip().length() > 128) {
            throw new IllegalArgumentException("LDAP 搜索词非法");
        }
        if (limit < 1 || limit > 50) throw new IllegalArgumentException("LDAP 搜索 limit 必须在 1..50");
    }

    private static void requireDescendantDn(String dn, String baseDn) {
        if (dn == null || dn.isBlank() || dn.length() > 1024) throw new IllegalArgumentException("LDAP 用户 DN 非法");
        try {
            LdapName candidate = new LdapName(dn);
            LdapName base = new LdapName(baseDn);
            if (candidate.size() <= base.size() || !candidate.startsWith(base)) {
                throw new IllegalArgumentException("LDAP 用户 DN 不在用户搜索范围内");
            }
        } catch (NamingException exception) {
            throw new IllegalArgumentException("LDAP 用户 DN 非法", exception);
        }
    }

    private static Attribute requiredAttribute(Attributes attributes, String name) throws NamingException {
        Attribute attribute = attributes.get(name);
        if (attribute == null || attribute.size() == 0) {
            throw new IdentitySourceConfigurationException("LDAP 必填属性缺失");
        }
        return attribute;
    }

    private static String stableValue(Attribute attribute) throws NamingException {
        Object value = attribute.get();
        if (value instanceof byte[] bytes) {
            if (bytes.length == 0) throw new IdentitySourceConfigurationException("LDAP 稳定属性为空");
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        }
        return stringValue(attribute);
    }

    private static String stringValue(Attribute attribute) throws NamingException {
        Object value = attribute.get();
        if (!(value instanceof String text) || text.isBlank()) {
            throw new IdentitySourceConfigurationException("LDAP 属性类型错误");
        }
        return text;
    }

    private static String optionalString(Attributes attributes, String name) throws NamingException {
        if (name == null) return null;
        Attribute attribute = attributes.get(name);
        return attribute == null || attribute.size() == 0 ? null : stringValue(attribute);
    }

    private static List<String> values(Attributes attributes, String name) throws NamingException {
        if (name == null) return List.of();
        Attribute attribute = attributes.get(name);
        if (attribute == null) return List.of();
        LinkedHashSet<String> values = new LinkedHashSet<>();
        NamingEnumeration<?> all = attribute.getAll();
        try {
            while (all.hasMore()) {
                Object value = all.next();
                if (!(value instanceof String text) || text.isBlank()) {
                    throw new IdentitySourceConfigurationException("LDAP group 属性类型错误");
                }
                values.add(text);
            }
        } finally {
            all.close();
        }
        return values.stream().sorted(Comparator.naturalOrder()).toList();
    }

    private static String[] returningAttributes(LdapSettings settings) {
        List<String> names = new ArrayList<>(List.of(
            settings.stableIdAttribute(),
            settings.usernameAttribute(),
            settings.displayNameAttribute()
        ));
        if (settings.emailAttribute() != null) names.add(settings.emailAttribute());
        if (settings.groupAttribute() != null) names.add(settings.groupAttribute());
        return names.stream().distinct().toArray(String[]::new);
    }

    private byte[] decryptSecret(IdentitySource source) {
        EncryptedSecret encryptedSecret = Objects.requireNonNull(source.encryptedSecret(), "encryptedSecret");
        return secretCipher.decrypt(
            SecretPurpose.IDENTITY_SECRET,
            new SecretAad(
                source.tenantId(),
                "ent_identity_source",
                Long.toString(source.id()),
                "secret_ciphertext",
                encryptedSecret.keyVersion()
            ),
            encryptedSecret
        );
    }

    private static void requireSource(IdentitySource source) {
        Objects.requireNonNull(source, "source");
        if (source.type() != IdentitySourceType.LDAP) {
            throw new IllegalArgumentException("LDAP adapter 收到错误身份源类型");
        }
    }

    private static void closeQuietly(StartTlsResponse tls, LdapContext context) {
        if (tls != null) {
            try {
                tls.close();
            } catch (Exception ignored) {
            }
        }
        if (context != null) {
            try {
                context.close();
            } catch (Exception ignored) {
            }
        }
    }

    private record LdapSession(LdapContext context, StartTlsResponse tls) implements AutoCloseable {
        @Override
        public void close() {
            closeQuietly(tls, context);
        }
    }
}
