/**
 * [INPUT]: 绑定 web.cors 的显式跨域许可列表。
 * [OUTPUT]: 对外提供默认拒绝跨域的 CORS 安全配置。
 * [POS]: common-web 的浏览器边界，同源请求不依赖 CORS 头。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.common.web.config.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties(prefix = "web.cors")
public class CorsProperties {

    /**
     * 是否允许携带凭证。
     */
    private Boolean allowCredentials = false;

    /**
     * 允许的来源匹配规则。
     */
    private List<String> allowedOriginPatterns = new ArrayList<>();

    /**
     * 允许的请求头。
     */
    private List<String> allowedHeaders = new ArrayList<>(List.of("*"));

    /**
     * 允许的请求方法。
     */
    private List<String> allowedMethods = new ArrayList<>(List.of("*"));

    /**
     * 预检请求缓存时间，单位秒。
     */
    private Long maxAge = 1800L;

}
