/**
 * [INPUT]: 投影 skill release catalog 与导入结果领域对象。
 * [OUTPUT]: 对外提供 bootstrap/runtime 与管理目录的统一脱敏 JSON view。
 * [POS]: skill/web 的唯一 DTO 投影；不暴露源码、凭据、正文或绝对路径。
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

    public static ReleaseView release(SkillRelease value) {
        return new ReleaseView(metadata(value));
    }

    public static ReleaseMetadataView metadata(SkillRelease value) {
        return new ReleaseMetadataView(Long.toString(value.id()), value.name(), value.version(),
            value.description(), value.license(), value.author(), value.userInvocable(), value.modelInvocable(),
            value.categories(), value.artifactSizeBytes(), value.artifactSha256(), value.status().name(), value.revision());
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

    public record ReleaseView(ReleaseMetadataView release) {
    }

    public record ReleaseMetadataView(String id, String name, String version, String description, String license,
        String author, boolean userInvocable, boolean modelInvocable, List<String> categories,
        long artifactSizeBytes, String artifactSha256, String status, long revision) {
    }

    public record ImportedReleaseView(String resolvedCommit, ReleaseMetadataView release, boolean created) {
    }
}
