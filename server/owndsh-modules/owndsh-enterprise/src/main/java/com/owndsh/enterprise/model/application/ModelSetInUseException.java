/**
 * [INPUT]: 接收模型集删除时由持久层确认的授权与配额策略引用统计。
 * [OUTPUT]: 对外提供稳定的模型集资源占用异常和删除阻塞详情。
 * [POS]: model/application 的模型集业务错误边界，不暴露多态引用表实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.persistence.ModelSetDeleteBlockers;

import java.util.Objects;

/**
 * 模型集仍被授权或配额策略引用。
 */
public final class ModelSetInUseException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_RESOURCE_IN_USE";

    private final ModelSetDeleteBlockers blockers;

    public ModelSetInUseException(ModelSetDeleteBlockers blockers) {
        super("模型集仍被授权或配额策略引用");
        this.blockers = Objects.requireNonNull(blockers, "blockers");
    }

    public ModelSetDeleteBlockers blockers() {
        return blockers;
    }
}
