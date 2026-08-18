/**
 * [INPUT]: 依赖 JdbcTemplate、Redisson、事务、tenant 配置、revision/audit 与 enterprise ID supplier。
 * [OUTPUT]: 对外装配 T09 quota policy、window、reservation、rate lease、usage 与 recovery Beans。
 * [POS]: quota 纵向模块的 Spring composition root，启动时验证 V6 冻结部署时区。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota;

import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.auth.EnterpriseIdentityProperties;
import org.dromara.enterprise.quota.application.EffectiveQuotaResolver;
import org.dromara.enterprise.quota.application.QuotaPolicyService;
import org.dromara.enterprise.quota.application.QuotaRateLimiter;
import org.dromara.enterprise.quota.application.QuotaRecoveryJob;
import org.dromara.enterprise.quota.application.QuotaReservationService;
import org.dromara.enterprise.quota.application.QuotaUsageQueryService;
import org.dromara.enterprise.quota.application.QuotaWindowCalculator;
import org.dromara.enterprise.quota.persistence.JdbcQuotaPolicyStore;
import org.dromara.enterprise.quota.persistence.JdbcQuotaRuntimeConfigStore;
import org.dromara.enterprise.quota.persistence.JdbcQuotaSubjectStore;
import org.dromara.enterprise.quota.persistence.JdbcQuotaWindowStore;
import org.dromara.enterprise.quota.persistence.JdbcUsageLedgerStore;
import org.dromara.enterprise.quota.persistence.JdbcUsageReservationStore;
import org.dromara.enterprise.quota.persistence.QuotaPolicyStore;
import org.dromara.enterprise.quota.persistence.QuotaRuntimeConfigStore;
import org.dromara.enterprise.quota.persistence.QuotaSubjectStore;
import org.dromara.enterprise.quota.persistence.QuotaWindowStore;
import org.dromara.enterprise.quota.persistence.RedisQuotaRateLimiter;
import org.dromara.enterprise.quota.persistence.UsageLedgerStore;
import org.dromara.enterprise.quota.persistence.UsageReservationStore;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.ZoneId;
import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(EnterpriseQuotaProperties.class)
public class EnterpriseQuotaConfiguration {
    @Bean
    QuotaPolicyStore enterpriseQuotaPolicyStore(JdbcTemplate jdbcTemplate) {
        return new JdbcQuotaPolicyStore(jdbcTemplate);
    }

    @Bean
    QuotaWindowStore enterpriseQuotaWindowStore(JdbcTemplate jdbcTemplate) {
        return new JdbcQuotaWindowStore(jdbcTemplate);
    }

    @Bean
    UsageReservationStore enterpriseUsageReservationStore(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcUsageReservationStore(jdbcTemplate, jsonMapper);
    }

    @Bean
    UsageLedgerStore enterpriseUsageLedgerStore(JdbcTemplate jdbcTemplate) {
        return new JdbcUsageLedgerStore(jdbcTemplate);
    }

    @Bean
    QuotaSubjectStore enterpriseQuotaSubjectStore(JdbcTemplate jdbcTemplate) {
        return new JdbcQuotaSubjectStore(jdbcTemplate);
    }

    @Bean
    QuotaRuntimeConfigStore enterpriseQuotaRuntimeConfigStore(JdbcTemplate jdbcTemplate) {
        return new JdbcQuotaRuntimeConfigStore(jdbcTemplate);
    }

    @Bean
    QuotaWindowCalculator enterpriseQuotaWindowCalculator(
        QuotaRuntimeConfigStore runtimeConfig,
        EnterpriseQuotaProperties quotaProperties,
        EnterpriseIdentityProperties identityProperties
    ) {
        ZoneId configured = ZoneId.of(quotaProperties.getDeploymentTimeZone());
        ZoneId frozen = runtimeConfig.resolveZone(identityProperties.getTenantId(), configured);
        return new QuotaWindowCalculator(frozen);
    }

    @Bean
    EffectiveQuotaResolver enterpriseEffectiveQuotaResolver(QuotaPolicyStore policyStore) {
        return new EffectiveQuotaResolver(policyStore);
    }

    @Bean
    QuotaRateLimiter enterpriseQuotaRateLimiter(RedissonClient redissonClient) {
        return new RedisQuotaRateLimiter(redissonClient);
    }

    @Bean
    QuotaPolicyService enterpriseQuotaPolicyService(
        PlatformTransactionManager transactionManager,
        QuotaPolicyStore policyStore,
        BootstrapRevisionStore revisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new QuotaPolicyService(
            new TransactionTemplate(transactionManager), policyStore, revisionStore, auditSink, ids
        );
    }

    @Bean
    QuotaReservationService enterpriseQuotaReservationService(
        PlatformTransactionManager transactionManager,
        EffectiveQuotaResolver resolver,
        QuotaWindowCalculator calculator,
        QuotaWindowStore windowStore,
        UsageReservationStore reservationStore,
        UsageLedgerStore ledgerStore,
        QuotaRateLimiter rateLimiter,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        TransactionTemplate normal = new TransactionTemplate(transactionManager);
        TransactionTemplate independent = new TransactionTemplate(transactionManager);
        independent.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return new QuotaReservationService(
            normal, independent, resolver, calculator, windowStore, reservationStore, ledgerStore,
            rateLimiter, auditSink, ids
        );
    }

    @Bean
    QuotaUsageQueryService enterpriseQuotaUsageQueryService(
        EffectiveQuotaResolver resolver,
        QuotaWindowCalculator calculator,
        QuotaWindowStore windowStore,
        QuotaRateLimiter rateLimiter,
        UsageLedgerStore ledgerStore
    ) {
        return new QuotaUsageQueryService(resolver, calculator, windowStore, rateLimiter, ledgerStore);
    }

    @Bean
    QuotaRecoveryJob enterpriseQuotaRecoveryJob(QuotaReservationService reservationService) {
        return new QuotaRecoveryJob(reservationService);
    }
}
