/**
 * [INPUT]: 依赖详细设计冻结的 MVP 上游范围。
 * [OUTPUT]: 对外提供唯一 DEEPSEEK_OPENAI provider 类型。
 * [POS]: model/domain 的上游协议封闭集合，阻止未实现 adapter 进入配置事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

public enum ProviderType {
    DEEPSEEK_OPENAI
}
