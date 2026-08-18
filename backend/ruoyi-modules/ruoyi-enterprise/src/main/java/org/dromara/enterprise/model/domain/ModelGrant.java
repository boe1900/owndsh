/**
 * [INPUT]: 聚合 model/subject 授权事实、默认标记、状态、revision 与管理展示名称。
 * [OUTPUT]: 对外提供 ModelGrant 领域记录。
 * [POS]: model/domain 的显式授权事实，modelAlias/subjectName 是可信 join 投影而非授权依据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import java.util.Objects;

public record ModelGrant(
    long id,
    String tenantId,
    long modelId,
    String modelAlias,
    GrantSubjectType subjectType,
    long subjectId,
    String subjectName,
    boolean isDefault,
    ModelStatus status,
    long revision
) {
    public ModelGrant {
        if (id <= 0 || modelId <= 0 || subjectId <= 0) {
            throw new IllegalArgumentException("grant id 必须为正数");
        }
        tenantId = requireText(tenantId, "tenantId", 20);
        modelAlias = requireText(modelAlias, "modelAlias", 120);
        Objects.requireNonNull(subjectType, "subjectType");
        subjectName = requireText(subjectName, "subjectName", 120);
        Objects.requireNonNull(status, "status");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }
}
