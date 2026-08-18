/**
 * [INPUT]: 依赖 JDBC/Jackson/事务/Redisson/ID generator、部署 URI/master key 与 RuoYi 登录/会话 ports。
 * [OUTPUT]: 对外装配 T04 身份能力及 T05 Redis PKCE/平台会话 Application Service。
 * [POS]: auth 纵向模块的 Spring composition root，领域与 adapter 均不使用静态容器查找。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import com.baomidou.mybatisplus.core.incrementer.IdentifierGenerator;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.auth.adapter.IdentityAdapterRegistry;
import org.dromara.enterprise.auth.adapter.IdentityEndpointPolicy;
import org.dromara.enterprise.auth.adapter.JdbcLocalAccountStore;
import org.dromara.enterprise.auth.adapter.LdapIdentityAdapter;
import org.dromara.enterprise.auth.adapter.LocalAccountStore;
import org.dromara.enterprise.auth.adapter.LocalIdentityAdapter;
import org.dromara.enterprise.auth.adapter.LoginFailurePolicy;
import org.dromara.enterprise.auth.adapter.OidcIdentityAdapter;
import org.dromara.enterprise.auth.application.ExternalIdentityService;
import org.dromara.enterprise.auth.application.CaptchaVerifier;
import org.dromara.enterprise.auth.application.IdentityGroupMappingService;
import org.dromara.enterprise.auth.application.IdentitySourceService;
import org.dromara.enterprise.auth.application.PlatformAuthorizationService;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.persistence.ExternalGroupMappingStore;
import org.dromara.enterprise.auth.persistence.ExternalIdentityStore;
import org.dromara.enterprise.auth.persistence.IdentitySourceStore;
import org.dromara.enterprise.auth.persistence.JdbcExternalGroupMappingStore;
import org.dromara.enterprise.auth.persistence.JdbcExternalIdentityStore;
import org.dromara.enterprise.auth.persistence.JdbcIdentitySourceStore;
import org.dromara.enterprise.auth.persistence.JdbcPlatformUserStore;
import org.dromara.enterprise.auth.persistence.PlatformUserStore;
import org.dromara.enterprise.auth.persistence.RedisAuthStateStore;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.function.LongSupplier;

/**
 * 企业身份模块 Bean 装配。
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(EnterpriseIdentityProperties.class)
public class EnterpriseIdentityConfiguration {
    @Bean
    SecretCipher enterpriseSecretCipher(EnterpriseIdentityProperties properties) {
        Path masterKeyFile = properties.getCrypto().getMasterKeyFile();
        if (masterKeyFile == null) {
            throw new IllegalStateException("enterprise.crypto.master-key-file 必须配置");
        }
        byte[] masterKey;
        try {
            masterKey = Files.readAllBytes(masterKeyFile);
        } catch (IOException exception) {
            throw new IllegalStateException("enterprise master key 文件不可读", exception);
        }
        if (masterKey.length != 32) {
            Arrays.fill(masterKey, (byte) 0);
            throw new IllegalStateException("enterprise master key 文件必须精确为 32 字节");
        }
        try {
            return new SecretCipher(masterKey);
        } finally {
            Arrays.fill(masterKey, (byte) 0);
        }
    }

    @Bean
    EnterpriseCursorCodec enterpriseCursorCodec(SecretCipher secretCipher) {
        return new EnterpriseCursorCodec(secretCipher);
    }

    @Bean
    IdentityEndpointPolicy identityEndpointPolicy(EnterpriseIdentityProperties properties) {
        return new IdentityEndpointPolicy(properties.getAuth().isAllowInsecureOidc());
    }

    @Bean
    IdentitySourceStore identitySourceStore(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcIdentitySourceStore(jdbcTemplate, jsonMapper);
    }

    @Bean
    RedisAuthStateStore redisAuthStateStore(RedissonClient redisson, JsonMapper jsonMapper) {
        return new RedisAuthStateStore(
            redisson,
            jsonMapper,
            Duration.ofMinutes(5),
            Duration.ofSeconds(60)
        );
    }

    @Bean
    ExternalGroupMappingStore externalGroupMappingStore(JdbcTemplate jdbcTemplate) {
        return new JdbcExternalGroupMappingStore(jdbcTemplate);
    }

    @Bean
    ExternalIdentityStore externalIdentityStore(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcExternalIdentityStore(jdbcTemplate, jsonMapper);
    }

    @Bean
    PlatformUserStore platformUserStore(JdbcTemplate jdbcTemplate) {
        return new JdbcPlatformUserStore(jdbcTemplate);
    }

    @Bean
    LocalAccountStore localAccountStore(JdbcTemplate jdbcTemplate) {
        return new JdbcLocalAccountStore(jdbcTemplate);
    }

    @Bean
    OidcIdentityAdapter oidcIdentityAdapter(SecretCipher secretCipher, IdentityEndpointPolicy endpointPolicy) {
        return new OidcIdentityAdapter(secretCipher, endpointPolicy);
    }

    @Bean
    LdapIdentityAdapter ldapIdentityAdapter(SecretCipher secretCipher, IdentityEndpointPolicy endpointPolicy) {
        return new LdapIdentityAdapter(secretCipher, endpointPolicy);
    }

    @Bean
    LocalIdentityAdapter localIdentityAdapter(LocalAccountStore accounts, LoginFailurePolicy failurePolicy) {
        return new LocalIdentityAdapter(accounts, failurePolicy);
    }

    @Bean
    IdentityAdapterRegistry identityAdapterRegistry(
        OidcIdentityAdapter oidc,
        LdapIdentityAdapter ldap,
        LocalIdentityAdapter local
    ) {
        return new IdentityAdapterRegistry(List.of(oidc, ldap, local));
    }

    @Bean("enterpriseIdSupplier")
    LongSupplier enterpriseIdSupplier(IdentifierGenerator generator) {
        return () -> generator.nextId(null).longValue();
    }

    @Bean
    IdentitySourceService identitySourceService(
        PlatformTransactionManager transactionManager,
        IdentitySourceStore sourceStore,
        SecretCipher secretCipher,
        IdentityEndpointPolicy endpointPolicy,
        IdentityAdapterRegistry adapterRegistry,
        BootstrapRevisionStore bootstrapRevisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new IdentitySourceService(
            new TransactionTemplate(transactionManager),
            sourceStore,
            secretCipher,
            endpointPolicy,
            adapterRegistry,
            bootstrapRevisionStore,
            auditSink,
            ids
        );
    }

    @Bean
    IdentityGroupMappingService identityGroupMappingService(
        PlatformTransactionManager transactionManager,
        ExternalGroupMappingStore mappingStore,
        IdentitySourceStore sourceStore,
        BootstrapRevisionStore bootstrapRevisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new IdentityGroupMappingService(
            new TransactionTemplate(transactionManager),
            mappingStore,
            sourceStore,
            bootstrapRevisionStore,
            auditSink,
            ids
        );
    }

    @Bean
    ExternalIdentityService externalIdentityService(
        PlatformTransactionManager transactionManager,
        IdentitySourceStore sourceStore,
        ExternalIdentityStore identityStore,
        ExternalGroupMappingStore mappingStore,
        PlatformUserStore userStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new ExternalIdentityService(
            new TransactionTemplate(transactionManager),
            sourceStore,
            identityStore,
            mappingStore,
            userStore,
            auditSink,
            ids
        );
    }

    @Bean
    PlatformAuthorizationService platformAuthorizationService(
        PlatformTransactionManager transactionManager,
        RedisAuthStateStore authStates,
        IdentitySourceStore sourceStore,
        IdentityAdapterRegistry adapterRegistry,
        OidcIdentityAdapter oidcAdapter,
        CaptchaVerifier captchaVerifier,
        ExternalIdentityService externalIdentityService,
        PlatformSessionGateway sessionGateway,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids,
        EnterpriseIdentityProperties properties
    ) {
        return new PlatformAuthorizationService(
            authStates,
            authStates,
            authStates,
            sourceStore,
            adapterRegistry,
            oidcAdapter,
            captchaVerifier,
            externalIdentityService,
            sessionGateway,
            new TransactionTemplate(transactionManager),
            auditSink,
            ids,
            requirePublicBaseUrl(properties.getPublicBaseUrl()),
            requireAdminRedirectUri(properties.getAdminRedirectUri())
        );
    }

    private static URI requirePublicBaseUrl(URI value) {
        if (value == null
            || !"https".equals(value.getScheme())
            || value.getHost() == null
            || value.getUserInfo() != null
            || value.getPort() != -1
            || !(value.getRawPath() == null || value.getRawPath().isEmpty() || "/".equals(value.getRawPath()))
            || value.getRawQuery() != null
            || value.getRawFragment() != null) {
            throw new IllegalStateException("enterprise.public-base-url 必须是无路径、端口、查询和 fragment 的 HTTPS 根地址");
        }
        return value;
    }

    private static URI requireAdminRedirectUri(URI value) {
        if (value == null
            || !"https".equals(value.getScheme())
            || value.getHost() == null
            || value.getUserInfo() != null
            || value.getRawFragment() != null) {
            throw new IllegalStateException("enterprise.admin-redirect-uri 必须是精确 HTTPS URI");
        }
        return value;
    }
}
