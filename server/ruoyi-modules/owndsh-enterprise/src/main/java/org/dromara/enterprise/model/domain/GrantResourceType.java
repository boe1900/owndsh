/**
 * [INPUT]: 依赖第二阶段 MODEL_SET/MODEL 批量授权资源模型。
 * [OUTPUT]: 对外提供模型授权资源封闭枚举。
 * [POS]: model/domain 的授权资源真源，不接受标签、路由规则或任意表达式。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

public enum GrantResourceType {
    MODEL_SET,
    MODEL
}
