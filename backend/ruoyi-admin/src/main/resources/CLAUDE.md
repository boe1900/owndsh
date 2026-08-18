# resources/

> L2 | 父级: ../../../CLAUDE.md

成员清单

application.yml: 默认应用配置，装配 enterprise URI/master key、首次写入后冻结的 `ENT_DEPLOYMENT_TIME_ZONE`、公开认证白名单与可信 forwarding header 策略。
application-dev.yml: 开发环境数据库、Redis 与日志覆盖，不保存生产秘密。
application-prod.yml: 生产运行参数覆盖，与部署环境变量共同生效。
banner.txt: RuoYi 应用启动 banner。
i18n/: RuoYi 通用中英文消息资源。
ip2region_v4.xdb: 上游 IP 地理信息数据库制品。
logback-plus.xml: 全局日志 sink、级别与脱敏格式配置。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
