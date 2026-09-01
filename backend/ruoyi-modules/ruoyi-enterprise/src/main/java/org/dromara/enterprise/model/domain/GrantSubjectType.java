/**
 * [INPUT]: 依赖第二阶段 ALL_MEMBERS/MEMBER additive allow 授权模型。
 * [OUTPUT]: 对外提供组织全员与单成员授权主体枚举。
 * [POS]: model/domain 的授权来源真源，拒绝部门和任意权限表达式进入模型访问。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

public enum GrantSubjectType {
    ALL_MEMBERS,
    MEMBER
}
