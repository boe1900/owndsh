/**
 * [INPUT]: 依赖公开源码 adapter、归档校验器、artifact provider 和 catalog 状态机。
 * [OUTPUT]: 将固定 GitLab/GitHub revision 导入为已校验的 DRAFT release；默认不持久化制品。
 * [POS]: skill/application 的 P1 导入编排；不自动发布、不自动分配。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.util.Objects;
import java.net.URI;

public final class SkillImportService {
    private final SkillSourceClient sources;
    private final SkillArchiveValidator validator;
    private final SkillArtifactStore artifacts;
    private final SkillCatalogService catalog;

    public SkillImportService(SkillSourceClient sources, SkillArchiveValidator validator,
        SkillArtifactStore artifacts, SkillCatalogService catalog) {
        this.sources = Objects.requireNonNull(sources, "sources");
        this.validator = Objects.requireNonNull(validator, "validator");
        this.artifacts = Objects.requireNonNull(artifacts, "artifacts");
        this.catalog = Objects.requireNonNull(catalog, "catalog");
    }

    public ImportResult importDraft(SkillMutationContext context, SkillSourceClient.Source source) {
        SkillSourceClient.FetchedArchive fetched = sources.fetch(source);
        SkillArchiveValidator.ValidatedSkill validated = validator.validate(
            new java.io.ByteArrayInputStream(fetched.archive()), source.subpath());
        SkillArtifactStore.ArtifactCoordinate coordinate = new SkillArtifactStore.ArtifactCoordinate(
            validated.name(), validated.version(), fetched.resolvedCommit());
        if (!"SOURCE_ARCHIVE".equalsIgnoreCase(artifacts.provider())) {
            artifacts.putIfAbsent(validated.sha256(), validated.archive(), coordinate);
        }
        SkillCatalogService.RegistrationResult registration = catalog.register(context,
            new SkillCatalogService.SkillReleaseDraft(validated.name(), validated.version(), validated.description(),
                validated.license(), validated.author(), validated.userInvocable(), validated.modelInvocable(),
                validated.categories(), validated.archive().length, validated.sha256(), sourceType(source.repositoryUrl()),
                source.repositoryUrl(), source.subpath(), fetched.resolvedCommit(), artifacts.provider(),
                artifacts.artifactRef(coordinate, validated.sha256())));
        return new ImportResult(fetched.resolvedCommit(), registration);
    }

    private static String sourceType(String repositoryUrl) {
        String host = URI.create(repositoryUrl).getHost();
        return "github.com".equalsIgnoreCase(host) ? "GITHUB" : "GITLAB";
    }

    public record ImportResult(String resolvedCommit, SkillCatalogService.RegistrationResult registration) {
        public ImportResult {
            Objects.requireNonNull(resolvedCommit, "resolvedCommit");
            Objects.requireNonNull(registration, "registration");
        }
    }
}
