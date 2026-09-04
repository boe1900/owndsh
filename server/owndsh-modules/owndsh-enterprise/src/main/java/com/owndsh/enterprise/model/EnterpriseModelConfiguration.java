/**
 * [INPUT]: 依赖 JdbcTemplate、Jackson、事务、SecretCipher、设备服务、revision/audit 基础设施与 enterprise ID supplier。
 * [OUTPUT]: 对外装配 T08 provider/model/grant、无重定向 probe、有效模型解析与 bootstrap Beans。
 * [POS]: model 纵向模块的 Spring composition root，领域/application 不使用静态容器查找。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model;

import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.model.application.BootstrapService;
import com.owndsh.enterprise.model.application.EffectiveModelResolver;
import com.owndsh.enterprise.model.application.JdkProviderProbe;
import com.owndsh.enterprise.model.application.ManagedModelService;
import com.owndsh.enterprise.model.application.ModelGrantService;
import com.owndsh.enterprise.model.application.ModelSetService;
import com.owndsh.enterprise.model.application.ProviderProbe;
import com.owndsh.enterprise.model.application.ProviderService;
import com.owndsh.enterprise.model.persistence.BootstrapUserStore;
import com.owndsh.enterprise.model.persistence.JdbcBootstrapUserStore;
import com.owndsh.enterprise.model.persistence.JdbcManagedModelStore;
import com.owndsh.enterprise.model.persistence.JdbcModelGrantStore;
import com.owndsh.enterprise.model.persistence.JdbcProviderStore;
import com.owndsh.enterprise.model.persistence.ManagedModelStore;
import com.owndsh.enterprise.model.persistence.ModelGrantStore;
import com.owndsh.enterprise.model.persistence.ProviderStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.quota.application.EffectiveQuotaResolver;
import com.owndsh.enterprise.plugin.application.EffectivePluginResolver;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
public class EnterpriseModelConfiguration {
    @Bean
    ProviderStore enterpriseProviderStore(JdbcTemplate jdbcTemplate) {
        return new JdbcProviderStore(jdbcTemplate);
    }

    @Bean
    ManagedModelStore enterpriseManagedModelStore(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcManagedModelStore(jdbcTemplate, jsonMapper);
    }

    @Bean
    ModelGrantStore enterpriseModelGrantStore(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcModelGrantStore(jdbcTemplate, jsonMapper);
    }

    @Bean
    BootstrapUserStore enterpriseBootstrapUserStore(JdbcTemplate jdbcTemplate) {
        return new JdbcBootstrapUserStore(jdbcTemplate);
    }

    @Bean
    ProviderProbe enterpriseProviderProbe() {
        return new JdkProviderProbe();
    }

    @Bean
    ProviderService enterpriseProviderService(
        PlatformTransactionManager transactionManager,
        ProviderStore providerStore,
        SecretCipher secretCipher,
        ProviderProbe providerProbe,
        BootstrapRevisionStore bootstrapRevisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new ProviderService(
            new TransactionTemplate(transactionManager), providerStore, secretCipher, providerProbe,
            bootstrapRevisionStore, auditSink, ids
        );
    }

    @Bean
    ManagedModelService enterpriseManagedModelService(
        PlatformTransactionManager transactionManager,
        ManagedModelStore modelStore,
        ProviderStore providerStore,
        BootstrapRevisionStore bootstrapRevisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new ManagedModelService(
            new TransactionTemplate(transactionManager), modelStore, providerStore,
            bootstrapRevisionStore, auditSink, ids
        );
    }

    @Bean
    ModelGrantService enterpriseModelGrantService(
        PlatformTransactionManager transactionManager,
        ModelGrantStore grantStore,
        ManagedModelStore modelStore,
        BootstrapRevisionStore bootstrapRevisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new ModelGrantService(
            new TransactionTemplate(transactionManager), grantStore, modelStore,
            bootstrapRevisionStore, auditSink, ids
        );
    }

    @Bean
    ModelSetService enterpriseModelSetService(
        PlatformTransactionManager transactionManager,
        JdbcTemplate jdbcTemplate,
        BootstrapRevisionStore revisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new ModelSetService(
            new TransactionTemplate(transactionManager), jdbcTemplate, revisionStore, auditSink, ids
        );
    }

    @Bean
    EffectiveModelResolver enterpriseEffectiveModelResolver(ModelGrantStore grantStore) {
        return new EffectiveModelResolver(grantStore);
    }

    @Bean
    BootstrapService enterpriseBootstrapService(
        DeviceService deviceService,
        BootstrapUserStore userStore,
        EffectiveModelResolver resolver,
        EffectiveQuotaResolver quotaResolver,
        EffectivePluginResolver pluginResolver,
        BootstrapRevisionStore revisionStore
    ) {
        return new BootstrapService(
            deviceService, userStore, resolver, quotaResolver, pluginResolver, revisionStore
        );
    }
}
