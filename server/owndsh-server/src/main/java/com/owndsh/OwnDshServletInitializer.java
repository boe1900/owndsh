/**
 * [INPUT]: 依赖 Spring Boot Servlet 容器桥和 OwnDshApplication composition root。
 * [OUTPUT]: 对外提供传统 Servlet 容器部署所需的应用初始化器。
 * [POS]: owndsh-server 的可选 WAR 启动桥，普通 JAR 启动仍由 OwnDshApplication 负责。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

/**
 * web容器中进行部署
 *
 * @author Lion Li
 */
public class OwnDshServletInitializer extends SpringBootServletInitializer {

    /**
     * 配置外部 Web 容器启动源。
     *
     * @param application Spring 应用构建器
     * @return 配置后的 Spring 应用构建器
     */
    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(OwnDshApplication.class);
    }

}
