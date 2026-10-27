/**
 * [INPUT]: 接收供应商显示名称与可选描述。
 * [OUTPUT]: 对外提供只含元信息的 provider 写 command。
 * [POS]: model/application 的供应商元信息校验边界；连接 endpoint 和 secret 由 ProviderConnectionSpec 负责。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import java.util.Objects;

public record ProviderSpec(String name, String description) {
    public ProviderSpec(String name) { this(name, ""); }
    public ProviderSpec { if (name == null || name.isBlank() || name.length() > 120) throw new IllegalArgumentException("name 非法"); if (description == null || description.length() > 500) throw new IllegalArgumentException("description 非法"); }
}
