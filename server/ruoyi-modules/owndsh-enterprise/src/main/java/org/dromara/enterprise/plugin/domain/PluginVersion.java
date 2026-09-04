/**
 * [INPUT]: 聚合 package、tgz CAS 引用、整包 hash、Ed25519 签名、compatibility 与版本状态。
 * [OUTPUT]: 对外提供防御性复制签名并约束 UPLOADED/VALIDATED/PUBLISHED/RETIRED 事实的不可变版本。
 * [POS]: plugin/domain 的可下载制品身份，artifactId 固定等于字符串化 version ID。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public record PluginVersion(
    long id,
    String tenantId,
    long packageId,
    String packageName,
    String version,
    String artifactRef,
    long sizeBytes,
    String sha256,
    byte[] signature,
    PluginCompatibility compatibility,
    Status status,
    long createdBy,
    Instant createdAt,
    long revision
) {
    private static final Pattern SEMVER = Pattern.compile(
        "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"
    );

    public PluginVersion {
        if (id <= 0 || packageId <= 0 || createdBy <= 0) throw new IllegalArgumentException("插件 ID 必须为正数");
        requireText(tenantId, "tenantId");
        requireText(packageName, "packageName");
        requireText(artifactRef, "artifactRef");
        if (version == null || version.length() > 64 || !SEMVER.matcher(version).matches()) {
            throw new IllegalArgumentException("version 非法");
        }
        if (sizeBytes <= 0 || sha256 == null || !sha256.matches("^[0-9a-f]{64}$")) {
            throw new IllegalArgumentException("制品大小或 SHA-256 非法");
        }
        if (signature == null || signature.length != 64) throw new IllegalArgumentException("Ed25519 签名必须为 64 字节");
        signature = signature.clone();
        Objects.requireNonNull(compatibility, "compatibility");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(createdAt, "createdAt");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    @Override
    public byte[] signature() {
        return signature.clone();
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }

    public enum Status { UPLOADED, VALIDATED, PUBLISHED, RETIRED }
}
