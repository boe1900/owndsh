/**
 * [INPUT]: 投影 skill release catalog 与导入结果领域对象。
 * [OUTPUT]: 对外提供 bootstrap/runtime 与管理目录的统一脱敏 JSON view。
 * [POS]: skill/web 的唯一 DTO 投影；管理目录仅返回公开源码仓库链接，不暴露凭据、正文或绝对路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.skill.application.EffectiveSkillResolver;
import com.owndsh.enterprise.skill.application.SkillImportService;
import com.owndsh.enterprise.skill.domain.SkillRelease;

import java.util.List;

public final class SkillViews {
    private SkillViews() {
    }

    public static RuntimeSkillsView runtime(EffectiveSkillResolver.ResolvedSkills resolved) {
        return new RuntimeSkillsView(resolved.revision(), resolved.skills().stream().map(SkillViews::runtime).toList());
    }

    public static RuntimeSkillView runtime(SkillRelease value) {
        return new RuntimeSkillView(Long.toString(value.id()), runtimeMetadata(value), value.artifactSizeBytes(), value.artifactSha256());
    }

    public static ReleaseMetadataView release(SkillRelease value) {
        return metadata(value);
    }

    public static ReleaseMetadataView metadata(SkillRelease value) {
        return new ReleaseMetadataView(Long.toString(value.id()), value.name(), value.version(),
            value.description(), value.license(), value.author(), value.userInvocable(), value.modelInvocable(),
            value.categories(), value.artifactSizeBytes(), value.artifactSha256(), value.status().name(), value.revision(),
            repositoryUrl(value), repositoryPath(value), value.resolvedCommit(), value.sourceCredentialId() == null ? null : Long.toString(value.sourceCredentialId()),
            value.releaseNotes(), value.current());
    }

    private static String repositoryUrl(SkillRelease value) {
        String locator = value.sourceLocator();
        String path = repositoryPath(value);
        String commit = value.resolvedCommit();
        if (locator == null || locator.isBlank() || path == null || commit == null || commit.isBlank()) return locator;
        String base = locator.endsWith("/") ? locator.substring(0, locator.length() - 1) : locator;
        if (base.endsWith(".git")) base = base.substring(0, base.length() - 4);
        String marker = "GITHUB".equalsIgnoreCase(value.sourceType()) ? "/tree/" : "/-/tree/";
        return base + marker + commit + "/" + path;
    }

    private static String repositoryPath(SkillRelease value) {
        return value.sourceSubpath() == null || value.sourceSubpath().isBlank() ? null : value.sourceSubpath();
    }

    private static RuntimeSkillMetadataView runtimeMetadata(SkillRelease value) {
        return new RuntimeSkillMetadataView(value.name(), value.version(), value.description(), value.license(),
            value.author(), value.userInvocable(), value.modelInvocable(), value.categories());
    }

    public static ImportedReleaseView imported(SkillImportService.ImportResult value) {
        return new ImportedReleaseView(value.resolvedCommit(), metadata(value.registration().release()), value.registration().created());
    }

    public record RuntimeSkillsView(long revision, List<RuntimeSkillView> skills) {
    }

    public record RuntimeSkillView(
        String releaseId,
        RuntimeSkillMetadataView metadata,
        long artifactSizeBytes,
        String artifactSha256
    ) {
    }

    public record RuntimeSkillMetadataView(
        String name, String version, String description, String license, String author,
        boolean userInvocable, boolean modelInvocable, List<String> categories
    ) {
    }

    public record ReleaseMetadataView(String id, String name, String version, String description, String license,
        String author, boolean userInvocable, boolean modelInvocable, List<String> categories,
        long artifactSizeBytes, String artifactSha256, String status, long revision,
        String repositoryUrl, String repositoryPath, String resolvedCommit, String credentialId,
        String releaseNotes, boolean current) {
    }

    public record ImportedReleaseView(String resolvedCommit, ReleaseMetadataView release, boolean created) {
    }
}
