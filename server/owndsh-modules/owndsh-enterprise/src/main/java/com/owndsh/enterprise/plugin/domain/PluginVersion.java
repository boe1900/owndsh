/**
 * [INPUT]: 聚合 package、市场来源、DSH 兼容性与版本状态。
 * [OUTPUT]: 对外提供约束 VALIDATED/PUBLISHED/RETIRED 状态的不可变版本。
 * [POS]: plugin/domain 的不可变版本身份；安装由宿主解析依赖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public record PluginVersion(
    long id,
    String tenantId,
    long packageId,
    String packageName,
    String version,
    Status status,
    long createdBy,
    Instant createdAt,
    long revision,
    PluginInstallation installation,
    PluginSource source,
    PluginEngines engines,
    Instant publishedAt
) {
    private static final Pattern SEMVER = Pattern.compile(
        "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)"
            + "(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?"
            + "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"
    );

    public PluginVersion {
        if (id <= 0 || packageId <= 0 || createdBy <= 0) throw new IllegalArgumentException("插件 ID 必须为正数");
        requireText(tenantId, "tenantId");
        requireText(packageName, "packageName");
        if (version == null || version.length() > 64 || !SEMVER.matcher(version).matches()) {
            throw new IllegalArgumentException("version 非法");
        }
        source = Objects.requireNonNull(source, "source");
        Objects.requireNonNull(installation, "installation").validateTarget(packageName, version, source);
        engines = Objects.requireNonNullElseGet(engines, () -> new PluginEngines(""));
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(createdAt, "createdAt");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    /** 兼容旧持久化和测试构造入口；旧记录等价于 npm 来源。 */
    public PluginVersion(
        long id, String tenantId, long packageId, String packageName, String version, Status status,
        long createdBy, Instant createdAt, long revision, PluginInstallation installation
    ) {
        this(id, tenantId, packageId, packageName, version, status, createdBy, createdAt, revision,
            installation, PluginSource.npm(""), new PluginEngines(""), status == Status.PUBLISHED ? createdAt : null);
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }

    public enum Status { VALIDATED, PUBLISHED, RETIRED }
}
