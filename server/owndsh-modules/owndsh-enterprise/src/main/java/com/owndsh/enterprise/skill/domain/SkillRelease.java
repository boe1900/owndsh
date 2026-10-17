/**
 * [INPUT]: 接收已验证 skill 的 WorkBuddy 元数据、制品长度/hash 与发布状态。
 * [OUTPUT]: 对外提供不含正文、凭据和路径的不可变 release 事实。
 * [POS]: skill/domain 的发布身份；客户端安装事实不进入 release，也不复制来源秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.domain;

import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public record SkillRelease(
    long id,
    String tenantId,
    String name,
    String version,
    String description,
    String license,
    String author,
    boolean userInvocable,
    boolean modelInvocable,
    List<String> categories,
    long artifactSizeBytes,
    String artifactSha256,
    String sourceType,
    String sourceLocator,
    String sourceSubpath,
    String resolvedCommit,
    String artifactProvider,
    String artifactRef,
    Status status,
    long revision
) {
    private static final Pattern NAME = Pattern.compile("^[a-z0-9][a-z0-9._-]*$");
    private static final Pattern VERSION = Pattern.compile("^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$");
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");

    public SkillRelease {
        if (id <= 0 || artifactSizeBytes <= 0 || artifactSizeBytes > 67_108_864 || revision < 0) {
            throw new IllegalArgumentException("skill release 数值非法");
        }
        requireText(tenantId, 20, "tenantId");
        requireText(name, 64, "skill name");
        requireText(version, 64, "skill version");
        if (!NAME.matcher(name).matches() || !VERSION.matcher(version).matches()) {
            throw new IllegalArgumentException("skill name/version 非法");
        }
        requireText(description, 2000, "description");
        requireText(license, 120, "license");
        requireText(author, 120, "author");
        if (!SHA256.matcher(artifactSha256).matches()) throw new IllegalArgumentException("skill sha256 非法");
        requireText(sourceType, 16, "sourceType");
        requireOptionalText(sourceLocator, 500, "sourceLocator");
        requireOptionalText(sourceSubpath, 256, "sourceSubpath");
        if (resolvedCommit != null && !resolvedCommit.matches("^[0-9a-f]{7,64}$")) {
            throw new IllegalArgumentException("resolvedCommit 非法");
        }
        requireText(artifactProvider, 32, "artifactProvider");
        requireText(artifactRef, 1000, "artifactRef");
        Objects.requireNonNull(status, "status");
        categories = List.copyOf(Objects.requireNonNull(categories, "categories"));
        if (categories.size() > 12 || categories.stream().anyMatch(value -> value == null || value.isBlank() || value.length() > 40)) {
            throw new IllegalArgumentException("skill categories 非法");
        }
    }

    public SkillRelease(long id, String tenantId, String name, String version, String description, String license,
        String author, boolean userInvocable, boolean modelInvocable, List<String> categories,
        long artifactSizeBytes, String artifactSha256, Status status, long revision) {
        this(id, tenantId, name, version, description, license, author, userInvocable, modelInvocable, categories,
            artifactSizeBytes, artifactSha256, "MANUAL", "", "", null, "SOURCE_ARCHIVE", artifactSha256 + ".zip",
            status, revision);
    }

    private static void requireText(String value, int max, String field) {
        if (value == null || value.isBlank() || value.length() > max) throw new IllegalArgumentException(field + " 非法");
    }

    private static void requireOptionalText(String value, int max, String field) {
        if (value == null || value.length() > max) throw new IllegalArgumentException(field + " 非法");
    }

    public enum Status { DRAFT, PUBLISHED, REVOKED }
}
