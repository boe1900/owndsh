/**
 * [INPUT]: 依赖 Spring MVC ResourceHandlerRegistry 与 ruoyi-enterprise 内置认证静态资源
 * [OUTPUT]: 提供 login.html/login.css/login.js 三个公开认证资源的显式 classpath 映射
 * [POS]: auth/web 的浏览器资源边界，确保依赖 jar 内的登录页在 Boot 应用中可达且不扩大公开目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class EnterpriseAuthResourceConfiguration implements WebMvcConfigurer {
    private static final String RESOURCE_LOCATION = "classpath:/static/enterprise/auth/";

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler(
            "/enterprise/auth/*.html",
            "/enterprise/auth/*.css",
            "/enterprise/auth/*.js"
        ).addResourceLocations(RESOURCE_LOCATION);
    }
}
