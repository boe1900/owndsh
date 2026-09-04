/**
 * [INPUT]: 依赖详细设计冻结的 MVP 上游范围。
 * [OUTPUT]: 对外提供 DeepSeek 官方与自定义 provider 类型。
 * [POS]: model/domain 的 provider 来源封闭枚举，协议能力由 ProviderApiProtocol 独立表达。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

public enum ProviderType {
    DEEPSEEK_OFFICIAL,
    CUSTOM
}
