/**
 * [INPUT]: 依赖 deploy profile、JDBC/事务、enterprise ID supplier 与 bootstrap 强类型配置。
 * [OUTPUT]: 提供在 Spring Boot readiness 前完成一次性管理员初始化的 ApplicationRunner。
 * [POS]: deployment 的 Spring composition root，非部署 profile 不创建或消费初始化 secret。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.deployment;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
@Profile("deploy")
@EnableConfigurationProperties(DeploymentBootstrapProperties.class)
public class DeploymentBootstrapConfiguration {
    @Bean
    DeploymentBootstrapService deploymentBootstrapService(
        JdbcTemplate jdbcTemplate,
        PlatformTransactionManager transactionManager,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids,
        DeploymentBootstrapProperties properties
    ) {
        return new DeploymentBootstrapService(
            jdbcTemplate,
            new TransactionTemplate(transactionManager),
            ids,
            properties.getUsername(),
            properties.getPasswordFile()
        );
    }

    @Bean
    ApplicationRunner deploymentBootstrapRunner(DeploymentBootstrapService bootstrap) {
        return arguments -> bootstrap.initialize();
    }
}
