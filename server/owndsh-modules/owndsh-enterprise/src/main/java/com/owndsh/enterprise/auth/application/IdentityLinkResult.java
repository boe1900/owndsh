/**
 * [INPUT]: 接收 external identity 解析后的平台 userId 与首次绑定结论。
 * [OUTPUT]: 对外提供 T05 建立平台会话所需的最小 IdentityLinkResult。
 * [POS]: external identity service 的成功结果，不重复携带外部 principal 或敏感属性。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

/**
 * 身份绑定解析结果。
 */
public record IdentityLinkResult(long userId, boolean linkedNow, boolean userProvisioned) {
    public IdentityLinkResult {
        if (userId <= 0) throw new IllegalArgumentException("身份绑定结果 ID 非法");
    }
}
