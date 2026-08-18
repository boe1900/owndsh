# ruoyi-admin/

> L2 | 父级: ../CLAUDE.md

成员清单

.flattened-pom.xml: Maven flatten 生成的发布 POM 快照，随上游基线保留，不作为手工依赖真源。
Dockerfile: Spring Boot 应用容器构建入口，T21 再接入企业部署镜像。
pom.xml: 应用装配 Maven 清单，聚合 RuoYi 与 ruoyi-enterprise 业务模块，并提供 Spring Boot 与 Draft 2020-12 JSON Schema 测试运行时。
src/main/: Spring Boot 启动、Web 装配与环境配置，通过包扫描加载 ruoyi-enterprise 基础设施 Bean 与 Flyway migration。
src/test/: 应用层自动测试，承载 T01 Sa-Token 设备语义与 T02 跨语言协议 fixture 验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
