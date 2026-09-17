# resources/

> L2 | 父级: ../../../CLAUDE.md

成员清单

application.yml: 唯一环境配置；装配数据库、Redis、JWT、master key、bootstrap、请求上限与 graceful drain；插件只存数据库配置，无文件存储或签名 secret。
banner.txt: OwnDsh Server 简洁启动 banner。
i18n/: Host 通用中英文消息资源。
ip2region_v4.xdb: 上游 IP 地理信息数据库制品。
logback-plus.xml: 唯一 ConsoleAppender 将应用日志写入 stdout，不创建文件日志或本地轮转归档，采集保留由容器平台负责。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
