/**
 * [INPUT]: 依赖 Spring Boot 自动配置、应用配置真源与有界启动指标缓冲区。
 * [OUTPUT]: 对外提供 OwnDsh 模块化单体的唯一 JVM 启动入口。
 * [POS]: owndsh-server 的 composition root，运行时生命周期与 graceful drain 由 Spring 容器管理。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.metrics.buffering.BufferingApplicationStartup;

/**
 * 启动程序
 *
 * @author Lion Li
 */

@SpringBootApplication
public class OwnDshApplication {

    /**
     * 应用启动入口。
     *
     * @param args 启动参数
     */
    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(OwnDshApplication.class);
        application.setApplicationStartup(new BufferingApplicationStartup(2048));
        application.run(args);
        System.out.println("OwnDsh Server started");
    }

}
