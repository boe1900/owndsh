/**
 * [INPUT]: 依赖 JDBC/Jackson/事务、设备/用户、revision/audit、ID 。
 * [OUTPUT]: 装配 plugin persistence、catalog 与 runtime 服务 Beans。
 * [POS]: plugin 纵向模块的 Spring composition root，领域/application 不使用静态容器或请求路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin;

import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.model.persistence.BootstrapUserStore;
import com.owndsh.enterprise.plugin.application.EffectivePluginResolver;
import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.application.PluginRuntimeService;
import com.owndsh.enterprise.plugin.persistence.JdbcPluginStore;
import com.owndsh.enterprise.plugin.persistence.PluginStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
public class EnterprisePluginConfiguration {
    @Bean
    PluginStore enterprisePluginStore(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcPluginStore(jdbcTemplate, jsonMapper);
    }

    @Bean
    EffectivePluginResolver enterpriseEffectivePluginResolver(
        PluginStore pluginStore,
        BootstrapRevisionStore revisionStore
    ) {
        return new EffectivePluginResolver(pluginStore, revisionStore);
    }

    @Bean
    PluginCatalogService enterprisePluginCatalogService(
        PlatformTransactionManager transactionManager,
        PluginStore pluginStore,
        BootstrapRevisionStore revisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new PluginCatalogService(
            new TransactionTemplate(transactionManager), pluginStore,
            revisionStore, auditSink, ids
        );
    }

    @Bean
    PluginRuntimeService enterprisePluginRuntimeService(
        PlatformTransactionManager transactionManager,
        DeviceService deviceService,
        BootstrapUserStore userStore,
        EffectivePluginResolver resolver,
        PluginStore pluginStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new PluginRuntimeService(
            new TransactionTemplate(transactionManager), deviceService, userStore, resolver,
            pluginStore, auditSink, ids
        );
    }
}
