/**
 * [INPUT]: 依赖 JDBC、Jackson、事务、设备/用户、revision、artifact provider 和企业 ID generator。
 * [OUTPUT]: 装配 skill persistence、catalog、公开源码导入、制品访问与 runtime service。
 * [POS]: skill 纵向模块的 Spring composition root；不把导入状态自动推进为发布状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.skill.application.EffectiveSkillResolver;
import com.owndsh.enterprise.skill.application.SkillCatalogService;
import com.owndsh.enterprise.skill.application.FilesystemSkillArtifactStore;
import com.owndsh.enterprise.skill.application.GitLabSkillArtifactStore;
import com.owndsh.enterprise.skill.application.SkillRuntimeService;
import com.owndsh.enterprise.skill.application.SkillArchiveValidator;
import com.owndsh.enterprise.skill.application.SkillArtifactStore;
import com.owndsh.enterprise.skill.application.SkillImportService;
import com.owndsh.enterprise.skill.application.SkillSourceClient;
import com.owndsh.enterprise.skill.application.HttpSkillSourceClient;
import com.owndsh.enterprise.skill.application.SourceArchiveSkillArtifactStore;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.skill.persistence.JdbcSkillStore;
import com.owndsh.enterprise.skill.persistence.SkillStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.function.LongSupplier;
import java.nio.file.Path;
import java.net.URI;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(EnterpriseSkillArtifactProperties.class)
public class EnterpriseSkillConfiguration {
    @Bean
    SkillArchiveValidator enterpriseSkillArchiveValidator() {
        return new SkillArchiveValidator();
    }

    @Bean
    SkillSourceClient enterpriseSkillSourceClient(JsonMapper jsonMapper) {
        return new HttpSkillSourceClient(jsonMapper);
    }

    @Bean
    SkillArtifactStore enterpriseSkillArtifactStore(EnterpriseSkillArtifactProperties properties) {
        if ("SOURCE_ARCHIVE".equalsIgnoreCase(properties.getProvider())) {
            return new SourceArchiveSkillArtifactStore();
        }
        if ("GITLAB_PACKAGE".equalsIgnoreCase(properties.getProvider())) {
            return new GitLabSkillArtifactStore(URI.create(properties.getGitlabBaseUrl()),
                properties.getGitlabProjectId(), properties.getGitlabDeployToken());
        }
        if (!"FILESYSTEM".equalsIgnoreCase(properties.getProvider())) {
            throw new IllegalArgumentException("不支持的 skill artifact provider");
        }
        return new FilesystemSkillArtifactStore(Path.of(properties.getRoot()));
    }

    @Bean
    SkillStore enterpriseSkillStore(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        return new JdbcSkillStore(jdbcTemplate, jsonMapper);
    }

    @Bean
    EffectiveSkillResolver enterpriseEffectiveSkillResolver(
        SkillStore skillStore,
        BootstrapRevisionStore revisionStore
    ) {
        return new EffectiveSkillResolver(skillStore, revisionStore);
    }

    @Bean
    SkillCatalogService enterpriseSkillCatalogService(
        PlatformTransactionManager transactionManager,
        SkillStore skillStore,
        BootstrapRevisionStore revisionStore,
        AuditSink auditSink,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids
    ) {
        return new SkillCatalogService(new TransactionTemplate(transactionManager), skillStore,
            revisionStore, auditSink, ids);
    }

    @Bean
    SkillImportService enterpriseSkillImportService(
        SkillSourceClient sourceClient,
        SkillArchiveValidator archiveValidator,
        SkillArtifactStore artifactStore,
        SkillCatalogService catalog
    ) {
        return new SkillImportService(sourceClient, archiveValidator, artifactStore, catalog);
    }

    @Bean
    SkillRuntimeService enterpriseSkillRuntimeService(
        DeviceService deviceService,
        EffectiveSkillResolver resolver,
        SkillStore skillStore
    ) {
        return new SkillRuntimeService(deviceService, resolver, skillStore);
    }
}
