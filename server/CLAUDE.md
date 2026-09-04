# server/

> L2 | 父级: ../CLAUDE.md

成员清单

.claude/: OwnDsh-Vue-Plus 上游 Claude Code 协作配置，随锁定源码快照保留。
.codex/: OwnDsh-Vue-Plus 上游 Codex 协作配置，随锁定源码快照保留。
.editorconfig: 后端源码编辑器格式基线。
.gitattributes: OwnDsh-Vue-Plus 上游文本属性约定。
.gitee/: 上游 Gitee 仓库模板与自动化元数据，作为来源快照保留。
.gitignore: Maven、IDE 与本地运行产物排除规则。
.mvn/: Maven Wrapper 运行时配置，保证后端构建入口可复现。
.run/: IntelliJ IDEA OwnDsh Server Docker 构建配置，固定输出 `owndsh/server:latest`。
LICENSE: OwnDsh-Vue-Plus MIT 许可证原文，必须随源码与交付物保留。
README.md: OwnDsh Server 模块、构建、测试与第三方来源边界说明。
mvnw: POSIX Maven Wrapper，是 server 构建、测试与后续模块门禁的统一入口。
mvnw.cmd: Windows Maven Wrapper，与 POSIX 入口保持同一 Maven 分发版本。
pom.xml: `owndsh-parent` Maven 聚合根，集中声明 Java 21、Spring Boot 4.1、第三方宿主模块、T02 JSON Schema validator 与 owndsh-enterprise 内部模块版本。
owndsh-server/: Spring Boot 最小生产装配层，只引入 system/API、认证辅助与 enterprise 运行依赖，并承载分层请求体上限、外部 JWT secret 与 graceful drain 配置；局部地图见 `owndsh-server/CLAUDE.md`。
owndsh-api/: 模块间 API 契约层，保持领域模块不经 Controller/Mapper 横向耦合。
owndsh-common/: OwnDsh 公共基础设施与框架能力；owndsh-common-security 对企业 API 保留登录校验，owndsh-common-web 默认拒绝跨域并省略企业参数日志，owndsh-common-satoken 不记录原始 Token，局部地图见 `owndsh-common/owndsh-common-satoken/CLAUDE.md`。
owndsh-extend/: 监控、任务等可选扩展模块，MVP 按详细设计裁剪非必要运行能力。
owndsh-modules/: 业务模块聚合层，包含边界独立的 `owndsh-enterprise` PostgreSQL/Redis、crypto/revision/audit、identity/PKCE/device/model/quota/plugin 纵向模块。
script/: 第三方数据库样例与 OwnDsh Server 手工启停脚本；企业迁移真源由 Flyway 独立管理。

本目录是锁定提交 `7180b529776834fee912113b23f0bd7a387a8222` 的源码快照，不含上游 `.git`。企业改动必须保持 Maven 模块边界，并在触及业务文件时补齐对应 L3 契约。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
