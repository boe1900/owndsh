/**
 * [INPUT]: 聚合后台生成的 providerKey、显示名称、描述、状态与 revision。
 * [OUTPUT]: 对外提供只含供应商元信息的 ModelProvider 聚合。
 * [POS]: model/domain 的供应商元信息聚合根；端点和密钥属于 ProviderConnection。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.domain;

import java.util.Objects;
import java.util.regex.Pattern;

public record ModelProvider(
    long id,
    String tenantId,
    String providerKey,
    String name,
    String description,
    ModelStatus status,
    long revision
) {
    private static final Pattern PROVIDER_KEY = Pattern.compile("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");

    public ModelProvider {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        providerKey = requireText(providerKey, "providerKey", 120);
        if (!PROVIDER_KEY.matcher(providerKey).matches()) throw new IllegalArgumentException("providerKey 非法");
        name = requireText(name, "name", 120);
        description = requireOptionalText(description, "description", 500);
        Objects.requireNonNull(status, "status");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public ModelProvider(long id, String tenantId, String providerKey, String name, ModelStatus status, long revision) {
        this(id, tenantId, providerKey, name, "", status, revision);
    }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }

    private static String requireOptionalText(String value, String name, int maximum) {
        if (value == null) return "";
        if (value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }
}
