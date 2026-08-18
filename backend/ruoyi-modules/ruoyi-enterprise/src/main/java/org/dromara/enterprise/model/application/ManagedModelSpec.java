/**
 * [INPUT]: 接收模型 provider、alias、上游名称、能力、排序与 reasoning 配置。
 * [OUTPUT]: 对外提供不含状态/revision 的受管模型写 command。
 * [POS]: model/application 的模型配置边界，显式拒绝保留的 enterprise/default sentinel。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import java.util.Objects;
import java.util.regex.Pattern;

public record ManagedModelSpec(
    long providerId,
    String alias,
    String displayName,
    String upstreamModel,
    int contextWindow,
    int maxOutputTokens,
    boolean reasoning,
    int sortOrder
) {
    private static final Pattern ALIAS = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");

    public ManagedModelSpec {
        if (providerId <= 0) throw new IllegalArgumentException("providerId 必须为正数");
        alias = requireText(alias, "alias", 120);
        if (!ALIAS.matcher(alias).matches() || "enterprise/default".equals(alias)) {
            throw new IllegalArgumentException("alias 非法或为保留值");
        }
        displayName = requireText(displayName, "displayName", 120);
        upstreamModel = requireText(upstreamModel, "upstreamModel", 255);
        if (contextWindow <= 0 || maxOutputTokens <= 0 || sortOrder < 0) {
            throw new IllegalArgumentException("模型窗口、输出或排序非法");
        }
    }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }
}
