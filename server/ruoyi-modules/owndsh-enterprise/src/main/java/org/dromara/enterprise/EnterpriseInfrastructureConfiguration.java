/**
 * [INPUT]: 依赖应用 DataSource 产生的 JdbcTemplate、事务管理器、Jackson 3 与 enterprise.http 配置。
 * [OUTPUT]: 对外装配 JDBC revision store、只追加 audit sink、revision 事务服务和 JSON 请求上限属性。
 * [POS]: owndsh-enterprise 的 Spring adapter 装配层，不在领域对象中隐藏静态容器访问。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise;

import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.audit.JdbcAuditSink;
import org.dromara.enterprise.common.api.EnterpriseHttpProperties;
import org.dromara.enterprise.revision.BootstrapRevisionService;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.dromara.enterprise.revision.JdbcBootstrapRevisionStore;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * 企业基础设施 Bean 装配。
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(EnterpriseHttpProperties.class)
public class EnterpriseInfrastructureConfiguration {
    @Bean
    BootstrapRevisionStore bootstrapRevisionStore(JdbcTemplate jdbcTemplate) {
        return new JdbcBootstrapRevisionStore(jdbcTemplate);
    }

    @Bean
    AuditSink enterpriseAuditSink(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcAuditSink(jdbcTemplate, jsonMapper);
    }

    @Bean
    BootstrapRevisionService bootstrapRevisionService(
        PlatformTransactionManager transactionManager,
        BootstrapRevisionStore revisionStore,
        AuditSink auditSink
    ) {
        return new BootstrapRevisionService(new TransactionTemplate(transactionManager), revisionStore, auditSink);
    }
}
