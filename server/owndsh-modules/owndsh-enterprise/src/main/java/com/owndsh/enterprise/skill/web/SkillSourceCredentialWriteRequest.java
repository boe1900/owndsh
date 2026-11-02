/**
 * [INPUT]: 接收管理端凭据备注名称和一次性 token。
 * [OUTPUT]: 转换为 SkillSourceCredentialService.CredentialInput，并在请求结束清零 token。
 * [POS]: skill/web 的秘密写入边界；不允许 token 进入日志或响应。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.skill.application.SkillSourceCredentialService;

import java.util.Arrays;

public record SkillSourceCredentialWriteRequest(
    String name,
    char[] token
) implements AutoCloseable {
    public SkillSourceCredentialWriteRequest {
        token = token == null ? null : token.clone();
    }

    public SkillSourceCredentialService.CredentialInput input() {
        return new SkillSourceCredentialService.CredentialInput(name, token);
    }

    @Override
    public void close() {
        if (token != null) Arrays.fill(token, '\0');
    }

    @Override
    public String toString() {
        return "SkillSourceCredentialWriteRequest[token=[REDACTED]]";
    }
}
