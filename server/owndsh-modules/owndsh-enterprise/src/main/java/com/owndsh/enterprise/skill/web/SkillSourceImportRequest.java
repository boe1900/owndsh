/**
 * [INPUT]: 接收管理员提交的公开 GitLab/GitHub 仓库、固定 ref 和 skill 子路径。
 * [OUTPUT]: 提供严格的源码导入请求转换。
 * [POS]: skill/web 的导入信任边界；不接受访问令牌、上传字节或任意下载 URL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.skill.application.SkillSourceClient;

public record SkillSourceImportRequest(String repositoryUrl, String revision, String subpath) {
    public SkillSourceClient.Source source() {
        return new SkillSourceClient.Source(repositoryUrl, revision, subpath);
    }
}
