/**
 * [INPUT]: 接收模型删除时由持久层确认的配置引用与用量统计。
 * [OUTPUT]: 对外提供稳定的模型资源占用异常和删除阻塞详情。
 * [POS]: model/application 的业务错误边界，不暴露数据库约束或 SQL 实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.persistence.ManagedModelDeleteBlockers;

import java.util.Objects;

/**
 * 模型仍被配置或使用记录引用。
 */
public final class ManagedModelInUseException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_RESOURCE_IN_USE";

    private final ManagedModelDeleteBlockers blockers;

    public ManagedModelInUseException(ManagedModelDeleteBlockers blockers) {
        super("模型仍被配置或使用记录引用");
        this.blockers = Objects.requireNonNull(blockers, "blockers");
    }

    public ManagedModelDeleteBlockers blockers() {
        return blockers;
    }
}
