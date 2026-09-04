/**
 * [INPUT]: 绑定应用 security 白名单。
 * [OUTPUT]: 对外提供 MVC 鉴权排除路径。
 * [POS]: owndsh-common-security 的强类型配置边界，不承载账号或密码值。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.common.security.config.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Security 配置属性
 *
 * @author Lion Li
 */
@Data
@ConfigurationProperties(prefix = "security")
public class SecurityProperties {

    /**
     * 排除路径
     */
    private String[] excludes;
}
