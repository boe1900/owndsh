/**
 * [INPUT]: 接收 SkillSourceCredential 脱敏领域事实。
 * [OUTPUT]: 提供凭据管理列表的稳定 JSON 投影，不暴露密文。
 * [POS]: skill/web 的凭据展示边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.skill.domain.SkillSourceCredential;

public final class SkillSourceCredentialViews {
    private SkillSourceCredentialViews() {}

    public static View view(SkillSourceCredential value) {
        return new View(Long.toString(value.id()), value.name(), value.host(), value.projectPath(),
            value.tokenHint(), value.expiresAt(), value.status().name(), value.revision());
    }

    public record View(String id, String name, String host, String projectPath, String tokenHint,
        java.time.Instant expiresAt, String status, long revision) {}
}
