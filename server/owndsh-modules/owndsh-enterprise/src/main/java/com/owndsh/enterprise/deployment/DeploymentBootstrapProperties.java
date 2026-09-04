/**
 * [INPUT]: 绑定 deploy profile 的初始化管理员用户名与密码环境变量。
 * [OUTPUT]: 对外提供数据库标记缺失时才需要消费的一次性 bootstrap 输入。
 * [POS]: deployment composition 的配置边界，完成 marker 使后续启动忽略固定或覆盖后的初始凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.deployment;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise.deployment.bootstrap")
public final class DeploymentBootstrapProperties {
    private String username;
    private String password;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
