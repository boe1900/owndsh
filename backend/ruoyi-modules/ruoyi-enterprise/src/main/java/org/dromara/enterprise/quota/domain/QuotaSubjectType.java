/**
 * [INPUT]: 依赖第二阶段 ORGANIZATION/MEMBER 独立叠加规则。
 * [OUTPUT]: 对外提供配额策略作用域封闭枚举。
 * [POS]: quota/domain 的生效主体真源，决定 subjectId 是否存在及匹配方式。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

public enum QuotaSubjectType {
    ORGANIZATION,
    MEMBER
}
