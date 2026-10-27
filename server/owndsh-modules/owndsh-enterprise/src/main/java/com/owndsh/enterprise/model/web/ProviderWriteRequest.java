/**
 * [INPUT]: 接收供应商显示名称与可选描述。
 * [OUTPUT]: 对外提供 ProviderSpec 转换。
 * [POS]: model/web 的供应商元信息写边界；endpoint 和密钥由连接接口负责。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ProviderSpec;

public record ProviderWriteRequest(String name, String description) {
    public ProviderWriteRequest {
        description = description == null ? "" : description;
    }

    public ProviderSpec spec() { return new ProviderSpec(name, description); }
}
