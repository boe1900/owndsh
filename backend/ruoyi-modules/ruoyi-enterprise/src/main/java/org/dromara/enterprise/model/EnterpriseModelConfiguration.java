/**
 * [INPUT]: 依赖 JdbcTemplate、事务、SecretCipher、设备服务、revision/audit 基础设施与 enterprise ID supplier。
 * [OUTPUT]: 对外装配 T08 provider/model/grant、无重定向 probe、有效模型解析与 bootstrap Beans。
 * [POS]: model 纵向模块的 Spring composition root，领域/application 不使用静态容器查找。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model;

import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.model.application.BootstrapService;
import org.dromara.enterprise.model.application.EffectiveModelResolver;
import org.dromara.enterprise.model.application.JdkProviderProbe;
import org.dromara.enterprise.model.application.ManagedModelService;
import org.dromara.enterprise.model.application.ModelGrantService;
import org.dromara.enterprise.model.application.ProviderProbe;
import org.dromara.enterprise.model.application.ProviderService;
import org.dromara.enterprise.model.persistence.BootstrapUserStore;
import org.dromara.enterprise.model.persistence.JdbcBootstrapUserStore;
import org.dromara.enterprise.model.persistence.JdbcManagedModelStore;
import org.dromara.enterprise.model.persistence.JdbcModelGrantStore;
import org.dromara.enterprise.model.persistence.JdbcProviderStore;
import org.dromara.enterprise.model.persistence.ManagedModelStore;
import org.dromara.enterprise.model.persistence.ModelGrantStore;
import org.dromara.enterprise.model.persistence.ProviderStore;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
public class EnterpriseModelConfiguration {
    @Bean
    ProviderStore enterpriseProviderStore(JdbcTemplate jdbcTemplate) {
        return new JdbcProviderStore(jdbcTemplate);
    }

    @Bean
    ManagedModelStore enterpriseManagedModelStore(JdbcTemplate jdbcTemplate) {
        return new JdbcManagedModelStore(jdbcTemplate);
    }

    @Bean
    ModelGrantStore enterpriseModelGrantStore(JdbcTemplate jdbcTemplate) {
        return new JdbcModelGrantStore(jdbcTemplate);
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
    EffectiveModelResolver enterpriseEffectiveModelResolver(ModelGrantStore grantStore) {
        return new EffectiveModelResolver(grantStore);
    }

    @Bean
    BootstrapService enterpriseBootstrapService(
        DeviceService deviceService,
        BootstrapUserStore userStore,
        EffectiveModelResolver resolver,
        BootstrapRevisionStore revisionStore
    ) {
        return new BootstrapService(deviceService, userStore, resolver, revisionStore);
    }
}
