/**
 * [INPUT]: 接收已完成校验的 skill 元数据、制品长度和 SHA-256。
 * [OUTPUT]: 提供草稿登记请求到 application draft 的转换。
 * [POS]: skill/web 的 P1 catalog 边界；源码导入在 Server 内完成后复用此契约。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.skill.application.SkillCatalogService;

import java.util.List;
import java.util.Objects;

public record SkillRegistrationRequest(
    String name,
    String version,
    String description,
    String license,
    String author,
    boolean userInvocable,
    boolean modelInvocable,
    List<String> categories,
    long artifactSizeBytes,
    String artifactSha256
) {
    public SkillRegistrationRequest {
        categories = List.copyOf(Objects.requireNonNull(categories, "categories"));
    }

    public SkillCatalogService.SkillReleaseDraft draft() {
        return new SkillCatalogService.SkillReleaseDraft(name, version, description, license, author,
            userInvocable, modelInvocable, categories, artifactSizeBytes, artifactSha256);
    }
}
