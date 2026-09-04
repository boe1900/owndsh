/**
 * [INPUT]: 依赖 JDBC/Jackson、固定企业 tenant 与 audit retention 配置
 * [OUTPUT]: 装配 AuditQueryStore、AuditQueryService 和每日 retention job
 * [POS]: audit 的 Spring composition root，append sink 仍由基础设施配置单独装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(EnterpriseAuditProperties.class)
public class EnterpriseAuditConfiguration {
    @Bean
    AuditQueryStore enterpriseAuditQueryStore(JdbcTemplate jdbc, JsonMapper json) {
        return new JdbcAuditQueryStore(jdbc, json);
    }

    @Bean
    AuditQueryService enterpriseAuditQueryService(AuditQueryStore store) {
        return new AuditQueryService(store);
    }

    @Bean
    AuditRetentionJob enterpriseAuditRetentionJob(
        AuditQueryService audit,
        EnterpriseIdentityProperties identity,
        EnterpriseAuditProperties properties
    ) {
        return new AuditRetentionJob(
            audit,
            identity.getTenantId(),
            properties.getRetentionDays(),
            properties.getRetentionBatchSize()
        );
    }
}
