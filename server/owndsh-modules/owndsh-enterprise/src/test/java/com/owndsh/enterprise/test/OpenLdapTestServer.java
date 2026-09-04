/**
 * [INPUT]: 依赖 Docker、osixia/openldap:1.5.0、classpath LDIF 与测试专用 trust-all TLS context。
 * [OUTPUT]: 为 LDAP 集成测试提供 StartTLS URL、manager DN/密码和 SSLSocketFactory。
 * [POS]: T04 测试基础设施，隔离容器/TLS 细节且 trust-all 能力绝不进入 main 源码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.test;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.MountableFile;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

/**
 * 共享 OpenLDAP StartTLS 测试容器。
 */
public final class OpenLdapTestServer {
    public static final String BASE_DN = "dc=example,dc=org";
    public static final String MANAGER_DN = "cn=admin," + BASE_DN;
    public static final String MANAGER_PASSWORD = "manager-password-61";

    private static final GenericContainer<?> LDAP = new GenericContainer<>("osixia/openldap:1.5.0")
        .withEnv("LDAP_ORGANISATION", "Example")
        .withEnv("LDAP_DOMAIN", "example.org")
        .withEnv("LDAP_ADMIN_PASSWORD", MANAGER_PASSWORD)
        .withEnv("LDAP_TLS", "true")
        .withEnv("LDAP_TLS_VERIFY_CLIENT", "never")
        .withCreateContainerCmdModifier(command -> command.withHostName("localhost"))
        .withCopyFileToContainer(
            MountableFile.forClasspathResource("ldap/bootstrap.ldif"),
            "/container/service/slapd/assets/config/bootstrap/ldif/custom/50-enterprise.ldif"
        )
        .withExposedPorts(389)
        .waitingFor(Wait.forLogMessage(".*slapd starting.*\\n", 1));

    static {
        LDAP.start();
    }

    private OpenLdapTestServer() {
    }

    public static String url() {
        return "ldap://" + LDAP.getHost() + ":" + LDAP.getMappedPort(389);
    }

    public static SSLSocketFactory trustAllSocketFactory() {
        try {
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[]{new TrustAllManager()}, new SecureRandom());
            return context.getSocketFactory();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("无法创建测试 TLS context", exception);
        }
    }

    private static final class TrustAllManager implements X509TrustManager {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }
}
