/**
 * [INPUT]: 绑定 deploy profile 的初始化管理员用户名与密码 secret 文件路径。
 * [OUTPUT]: 对外提供数据库标记缺失时才需要消费的一次性 bootstrap 输入。
 * [POS]: deployment composition 的配置边界，不保存密码值且不在绑定阶段强制重启继续提供 secret。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.deployment;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties(prefix = "enterprise.deployment.bootstrap")
public final class DeploymentBootstrapProperties {
    private String username;
    private Path passwordFile;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public Path getPasswordFile() {
        return passwordFile;
    }

    public void setPasswordFile(Path passwordFile) {
        this.passwordFile = passwordFile;
    }
}
