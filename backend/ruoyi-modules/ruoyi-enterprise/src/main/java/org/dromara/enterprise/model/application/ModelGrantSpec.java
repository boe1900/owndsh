/**
 * [INPUT]: 接收 model、subject、默认标记与授权状态。
 * [OUTPUT]: 对外提供单条/批量授权共享的写 command。
 * [POS]: model/application 的授权配置边界，主体存在性和默认唯一性由事务服务裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.ModelStatus;

import java.util.Objects;

public record ModelGrantSpec(
    long modelId,
    GrantSubjectType subjectType,
    long subjectId,
    boolean isDefault,
    ModelStatus status
) {
    public ModelGrantSpec {
        if (modelId <= 0 || subjectId <= 0) throw new IllegalArgumentException("model/subject id 必须为正数");
        Objects.requireNonNull(subjectType, "subjectType");
        Objects.requireNonNull(status, "status");
    }
}
