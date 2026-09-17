/**
 * [INPUT]: 依赖 JDBC/Jackson/事务、revision 与企业 ID supplier。
 * [OUTPUT]: 装配 MCP store/service beans。
 * [POS]: mcp 纵向模块 Spring composition root。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp;

import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.mcp.application.McpService;
import com.owndsh.enterprise.mcp.persistence.JdbcMcpStore;
import com.owndsh.enterprise.mcp.persistence.McpStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.util.function.LongSupplier;

@Configuration(proxyBeanMethods=false)
public class EnterpriseMcpConfiguration {
    @Bean McpStore enterpriseMcpStore(JdbcTemplate jdbc,JsonMapper json){return new JdbcMcpStore(jdbc,json);}
    @Bean McpService enterpriseMcpService(PlatformTransactionManager tx,McpStore store,BootstrapRevisionStore revisions,AuditSink audit,@Qualifier("enterpriseIdSupplier") LongSupplier ids){return new McpService(new TransactionTemplate(tx),store,revisions,ids,audit);}
}
