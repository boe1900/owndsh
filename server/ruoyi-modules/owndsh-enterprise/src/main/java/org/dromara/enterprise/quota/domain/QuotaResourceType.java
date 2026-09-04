/**
 * [INPUT]: 依赖第二阶段全部模型、模型集、单模型与供应商速率资源范围。
 * [OUTPUT]: 对外提供配额策略资源范围封闭枚举。
 * [POS]: quota/domain 的资源匹配真源，拒绝标签表达式和任意策略 DSL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

public enum QuotaResourceType {
    ALL_MODELS,
    MODEL_SET,
    MODEL,
    PROVIDER
}
