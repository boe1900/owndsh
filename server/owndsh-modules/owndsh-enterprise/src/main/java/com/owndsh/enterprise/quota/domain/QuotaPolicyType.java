/**
 * [INPUT]: 无外部依赖，封闭配额策略的累计量与瞬时流量语义。
 * [OUTPUT]: 对外提供 TOKEN/RATE 两类互斥策略类型。
 * [POS]: quota/domain 的策略判别真源，阻止 Token 窗口与 RPM/并发混入同一规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

public enum QuotaPolicyType {
    TOKEN,
    RATE
}
