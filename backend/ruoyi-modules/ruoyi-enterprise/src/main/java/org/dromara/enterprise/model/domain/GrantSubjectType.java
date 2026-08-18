/**
 * [INPUT]: 依赖详细设计的当前用户与当前部门授权范围。
 * [OUTPUT]: 对外提供 USER/DEPT 授权主体枚举。
 * [POS]: model/domain 的授权来源真源，决定默认优先级与 RuoYi 存在性查询。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

public enum GrantSubjectType {
    USER,
    DEPT
}
