/**
 * [INPUT]: 依赖 V1 provider/model/grant check constraints。
 * [OUTPUT]: 对外提供 ACTIVE/DISABLED 状态枚举。
 * [POS]: model/domain 的共同启停语义，resolver 只消费三层均 ACTIVE 的事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.domain;

public enum ModelStatus {
    ACTIVE,
    DISABLED
}
