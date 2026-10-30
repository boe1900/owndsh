/**
 * [INPUT]: 接收管理员提交的公开/私有 GitLab/GitHub 仓库、固定 ref 和凭据引用。
 * [OUTPUT]: 提供严格的源码导入请求转换，不携带 token 明文。
 * [POS]: skill/web 的导入信任边界；凭据只通过 credentialId 进入服务端。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.skill.application.SkillSourceClient;

public record SkillSourceImportRequest(String repositoryUrl, String revision,
    String visibility, Long credentialId, String releaseNotes) {
    public SkillSourceClient.Source source() {
        return new SkillSourceClient.Source(repositoryUrl, revision);
    }
}
