/**
 * [INPUT]: 依赖 JdbcTemplate、事务、AuditSink、PlatformSessionGateway 与 enterprise ID supplier。
 * [OUTPUT]: 对外装配 JdbcDeviceStore 和 DeviceService Bean。
 * [POS]: device 纵向模块的 Spring composition root，不在领域中使用静态容器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device;

import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.persistence.DeviceStore;
import com.owndsh.enterprise.device.persistence.JdbcDeviceStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
public class EnterpriseDeviceConfiguration {
    @Bean
    DeviceStore enterpriseDeviceStore(JdbcTemplate jdbcTemplate) {
        return new JdbcDeviceStore(jdbcTemplate);
    }

    @Bean
    DeviceService enterpriseDeviceService(
        PlatformTransactionManager transactionManager,
        DeviceStore deviceStore,
        AuditSink auditSink,
        PlatformSessionGateway sessionGateway,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new DeviceService(
            new TransactionTemplate(transactionManager),
            deviceStore,
            auditSink,
            sessionGateway,
            ids
        );
    }
}
