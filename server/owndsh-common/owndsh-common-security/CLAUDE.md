# owndsh-common-security/

> L2 | 父级: ../../CLAUDE.md

成员清单

.flattened-pom.xml: Maven flatten 生成的发布 POM 快照，不作为手工依赖真源。
pom.xml: Sa-Token 安全自动配置模块的 Maven 依赖边界。
src/main/java/com/owndsh/common/security/config/SecurityConfig.java: 全局 Sa-Token Servlet/filter 与路由鉴权入口；非企业路由校验登录/clientid，企业 API 完整下沉到领域 context 读取 Token session 以保留撤销语义。
src/main/java/com/owndsh/common/security/config/properties/SecurityProperties.java: 登录白名单的强类型配置边界。
src/main/java/com/owndsh/common/security/handler/AllUrlHandler.java: 聚合 Spring MVC 路由并排除静态资源和白名单的鉴权路径发现器。
src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports: 注册 SecurityConfig 自动配置。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
