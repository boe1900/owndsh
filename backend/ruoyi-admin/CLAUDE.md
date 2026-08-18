# ruoyi-admin/

> L2 | 父级: ../CLAUDE.md

成员清单

.flattened-pom.xml: Maven flatten 生成的发布 POM 快照，随上游基线保留，不作为手工依赖真源。
Dockerfile: Spring Boot 应用容器构建入口，T21 再接入企业部署镜像。
pom.xml: 应用装配 Maven 清单，聚合 RuoYi 业务模块并提供 Spring Boot 测试运行时。
src/main/: Spring Boot 启动、Web 装配与环境配置，T03 起注入 ruoyi-enterprise 运行模块。
src/test/: 应用层自动测试，T01 增加 Sa-Token 多设备不共享和独立撤销技术验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
