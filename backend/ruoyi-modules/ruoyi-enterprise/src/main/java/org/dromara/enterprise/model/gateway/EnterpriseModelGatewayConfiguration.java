/**
 * [INPUT]: 依赖模型/设备/配额/crypto/audit ports、Jackson、事务管理器与 enterprise ID supplier。
 * [OUTPUT]: 对外装配严格 parser、请求级 route、DeepSeek client、gateway service 与配置 Beans。
 * [POS]: model/gateway 的 Spring composition root，保持网络 adapter 与生命周期核心可独立测试替换。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.model.application.EffectiveModelResolver;
import org.dromara.enterprise.model.persistence.BootstrapUserStore;
import org.dromara.enterprise.model.persistence.ManagedModelStore;
import org.dromara.enterprise.model.persistence.ProviderStore;
import org.dromara.enterprise.quota.application.QuotaReservationService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(EnterpriseGatewayProperties.class)
public class EnterpriseModelGatewayConfiguration {
    @Bean
    GatewayChatRequestParser enterpriseGatewayChatRequestParser(JsonMapper jsonMapper) {
        return new GatewayChatRequestParser(jsonMapper);
    }

    @Bean
    GatewayRouteResolver enterpriseGatewayRouteResolver(
        DeviceService devices,
        BootstrapUserStore users,
        EffectiveModelResolver effectiveModels,
        ManagedModelStore models,
        ProviderStore providers
    ) {
        return new GatewayRouteResolver(devices, users, effectiveModels, models, providers);
    }

    @Bean
    DeepSeekUpstreamClient enterpriseDeepSeekUpstreamClient(EnterpriseGatewayProperties properties) {
        properties.validate();
        return new JdkDeepSeekUpstreamClient(properties.getMaxSseEventBytes());
    }

    @Bean
    ModelGatewayService enterpriseModelGatewayService(
        PlatformTransactionManager transactionManager,
        GatewayRouteResolver routes,
        QuotaReservationService quotas,
        DeepSeekUpstreamClient upstream,
        SecretCipher cipher,
        AuditSink audit,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids,
        JsonMapper jsonMapper
    ) {
        return new ModelGatewayService(
            new TransactionTemplate(transactionManager), routes, quotas, upstream, cipher, audit, ids, jsonMapper
        );
    }
}
