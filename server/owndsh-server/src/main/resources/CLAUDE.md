# resources/

> L2 | 父级: ../../../CLAUDE.md

成员清单

application.yml: 唯一应用配置，Flyway 从 V0 初始化并兼容旧 baseline 0，JDBC 由服务器推断字符串参数类型，以环境变量装配 PostgreSQL、Redis、JWT、master key、默认关闭的插件签名与可选 signing key、bootstrap、同源 CORS、OIDC 传输开关、请求上限、graceful drain 与 health-only Actuator；开发、Compose 和生产不再维护 profile 配置副本。
banner.txt: OwnDsh Server 简洁启动 banner。
i18n/: Host 通用中英文消息资源。
ip2region_v4.xdb: 上游 IP 地理信息数据库制品。
logback-plus.xml: 唯一 ConsoleAppender 将应用日志写入 stdout，不创建文件日志或本地轮转归档，采集保留由容器平台负责。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
