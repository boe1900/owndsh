# ruoyi-admin/

> L2 | 父级: ../CLAUDE.md

成员清单

.flattened-pom.xml: Maven flatten 生成的发布 POM 快照，随上游基线保留，不作为手工依赖真源。
Dockerfile: Spring Boot 应用容器构建入口，T21 再接入企业部署镜像。
pom.xml: 应用装配 Maven 清单，聚合 RuoYi 与 ruoyi-enterprise 业务模块，并提供 Spring Boot 与 Draft 2020-12 JSON Schema 测试运行时。
src/main/: Spring Boot 启动、Web 与环境装配；加载 ruoyi-enterprise/Flyway，以 RuoYiLoginFailurePolicy 复用 LOCAL 锁定策略，并由 Spring 管理有界 graceful drain。
src/main/resources/: 应用配置、enterprise 环境变量、模型流资源/无总时长边界与公开认证白名单；局部地图见 src/main/resources/CLAUDE.md。
src/test/: 应用层自动测试，承载 Sa-Token 设备语义、跨语言协议 fixture 与 T20 安全默认值验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
