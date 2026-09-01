/**
 * [INPUT]: 接收 modelId、ALL_MEMBERS/MEMBER subject 与状态授权字段。
 * [OUTPUT]: 对外提供 ModelGrantSpec 转换。
 * [POS]: model/web 的单条/批量授权共享 DTO，subjectName 永远由服务端 RuoYi 事实解析。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.application.ModelGrantSpec;
import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.ModelStatus;

public record ModelGrantWriteRequest(
    long modelId,
    GrantSubjectType subjectType,
    Long subjectId,
    ModelStatus status
) {
    public ModelGrantSpec spec() {
        return new ModelGrantSpec(modelId, subjectType, subjectId, status);
    }
}
