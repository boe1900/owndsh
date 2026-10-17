/**
 * [INPUT]: 绑定 enterprise.skill.artifact 的回源类型、可选单机根目录或 GitLab Package Registry 连接参数。
 * [OUTPUT]: 提供已校验的 artifact adapter 配置；部署令牌只在服务端内存中使用。
 * [POS]: skill 模块的制品访问配置边界，不向 Controller 或员工端暴露凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise.skill.artifact")
public final class EnterpriseSkillArtifactProperties {
    private String provider = "SOURCE_ARCHIVE";
    private String root = System.getProperty("java.io.tmpdir") + "/owndsh-skill-artifacts";
    private String gitlabBaseUrl = "";
    private String gitlabProjectId = "";
    private String gitlabDeployToken = "";

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getRoot() { return root; }
    public void setRoot(String root) { this.root = root; }
    public String getGitlabBaseUrl() { return gitlabBaseUrl; }
    public void setGitlabBaseUrl(String gitlabBaseUrl) { this.gitlabBaseUrl = gitlabBaseUrl; }
    public String getGitlabProjectId() { return gitlabProjectId; }
    public void setGitlabProjectId(String gitlabProjectId) { this.gitlabProjectId = gitlabProjectId; }
    public String getGitlabDeployToken() { return gitlabDeployToken; }
    public void setGitlabDeployToken(String gitlabDeployToken) { this.gitlabDeployToken = gitlabDeployToken; }
}
