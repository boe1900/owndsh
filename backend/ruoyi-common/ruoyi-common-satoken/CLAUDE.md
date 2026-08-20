# ruoyi-common-satoken/

> L2 | 父级: ../../CLAUDE.md

成员清单

.flattened-pom.xml: Maven flatten 生成的发布 POM 快照，不作为手工依赖真源。
pom.xml: Sa-Token Boot 4、JWT、Redis DAO、权限解析和本地缓存依赖边界。
src/main/java/org/dromara/common/satoken/config/SaTokenConfig.java: 装配 JWT StpLogic、Redis SaTokenDao、权限服务与全局异常处理。
src/main/java/org/dromara/common/satoken/core/: Sa-Token 对 Redis TTL/对象存储与 RuoYi 角色权限事实的 adapter。
src/main/java/org/dromara/common/satoken/handler/SaTokenExceptionHandler.java: 无 raw Token/message/stack 回显的全局 401/403 失败边界。
src/main/java/org/dromara/common/satoken/utils/LoginHelper.java: RuoYi 登录上下文、client terminal 与授权事实访问入口。
src/main/resources/common-satoken.yml: Sa-Token 动态活跃超时等公共默认配置。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
