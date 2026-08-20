/**
 * [INPUT]: 绑定应用 security 白名单与 Actuator Basic Auth 开关。
 * [OUTPUT]: 对外提供 MVC 鉴权排除路径；Actuator filter 的条件装配直接读取同前缀开关。
 * [POS]: ruoyi-common-security 的强类型配置边界，不承载账号或密码值。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.common.security.config.properties;

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
