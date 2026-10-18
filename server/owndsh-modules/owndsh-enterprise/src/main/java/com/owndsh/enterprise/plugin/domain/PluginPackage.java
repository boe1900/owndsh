/**
 * [INPUT]: 聚合 tenant 内 npm package 名、DSH 插件级市场资料、可分配状态与 CAS revision。
 * [OUTPUT]: 对外提供满足 package 命名和 revision 不变量的不可变插件聚合根。
 * [POS]: plugin/domain 的 assignment ownership 根，version 与 assignment 必须归属其 ID。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import java.util.Objects;
import java.util.regex.Pattern;

public record PluginPackage(
    long id,
    String tenantId,
    String packageName,
    String displayName,
    Status status,
    long revision,
    PluginMarketMetadata marketMetadata
) {
    private static final Pattern PACKAGE_NAME = Pattern.compile(
        "^(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*$"
    );

    public PluginPackage {
        if (id <= 0) throw new IllegalArgumentException("package ID 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        packageName = requireText(packageName, "packageName", 214);
        if (!PACKAGE_NAME.matcher(packageName).matches()) throw new IllegalArgumentException("packageName 非法");
        displayName = requireText(displayName, "displayName", 120);
        Objects.requireNonNull(status, "status");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
        if (marketMetadata == null) {
            marketMetadata = new PluginMarketMetadata(
                displayName, "", "", "", "", "", "", "", java.util.List.of(), java.util.List.of(), java.util.Map.of()
            );
        }
    }

    /** 兼容旧管理端构造入口；新登记使用包含 marketMetadata 的构造器。 */
    public PluginPackage(long id, String tenantId, String packageName, String displayName, Status status, long revision) {
        this(id, tenantId, packageName, displayName, status, revision, null);
    }

    private static String requireText(String value, String name, int maxLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maxLength) throw new IllegalArgumentException(name + " 非法");
        return value;
    }

    public enum Status { ACTIVE, DISABLED }
}
