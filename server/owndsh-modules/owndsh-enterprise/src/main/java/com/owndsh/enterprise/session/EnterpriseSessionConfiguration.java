/**
 * [INPUT]: 依赖 JDBC/Jackson/事务、ACTIVE 设备、SecretCipher、AuditSink、企业 tenant 与 ID generator。
 * [OUTPUT]: 装配 Session parser/store/service 和每日 retention job Beans。
 * [POS]: session 纵向模块的 Spring composition root，业务层不读取环境或静态容器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session;

import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.session.application.SessionBatchParser;
import com.owndsh.enterprise.session.application.SessionRetentionJob;
import com.owndsh.enterprise.session.application.SessionService;
import com.owndsh.enterprise.session.persistence.JdbcSessionStore;
import com.owndsh.enterprise.session.persistence.SessionStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(EnterpriseSessionProperties.class)
public class EnterpriseSessionConfiguration {
    @Bean
    SessionStore enterpriseSessionStore(JdbcTemplate jdbcTemplate) {
        return new JdbcSessionStore(jdbcTemplate);
    }

    @Bean
    SessionBatchParser enterpriseSessionBatchParser(JsonMapper json,EnterpriseSessionProperties properties) {
        return new SessionBatchParser(json,properties.getMaxBatchBytes());
    }

    @Bean
    SessionService enterpriseSessionService(
        PlatformTransactionManager transactionManager,
        DeviceService deviceService,
        SessionBatchParser parser,
        SessionStore sessionStore,
        SecretCipher cipher,
        JsonMapper json,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new SessionService(
            new TransactionTemplate(transactionManager),deviceService,parser,sessionStore,
            cipher,json,auditSink,ids
        );
    }

    @Bean
    SessionRetentionJob enterpriseSessionRetentionJob(
        SessionService sessionService,
        EnterpriseIdentityProperties identity,
        EnterpriseSessionProperties properties
    ) {
        return new SessionRetentionJob(
            sessionService,identity.getTenantId(),properties.getRetentionDays(),properties.getRetentionBatchSize()
        );
    }
}
