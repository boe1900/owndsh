# skill/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

EnterpriseSkillConfiguration.java: 装配 skill store、catalog、公开源码导入、artifact provider 和 runtime service。
EnterpriseSkillArtifactProperties.java: 绑定公开源码回源、单机 filesystem 或 GitLab Generic Package Registry 访问配置，服务端保留部署令牌。
domain/: release 的不可变发布事实；局部地图见 domain/CLAUDE.md。
application/: 管理端 catalog 状态机、公开 GitLab/GitHub 固定 revision 导入、ZIP/frontmatter 校验、artifact 回源或存储与 runtime 目录读取。
persistence/: skill release 状态的 JDBC 端口与租户隔离 SQL。
web/: 管理端 catalog 与 runtime 目录/制品下载的严格 HTTP DTO/Controller。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
