/**
 * [INPUT]: 依赖详细设计第 10.1 节 DEFAULT/DEPT/USER 叠加规则。
 * [OUTPUT]: 对外提供配额策略作用域封闭枚举。
 * [POS]: quota/domain 的生效主体真源，决定 subjectId 是否存在及匹配方式。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

public enum QuotaSubjectType {
    DEFAULT,
    DEPT,
    USER
}
