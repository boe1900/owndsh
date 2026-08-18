# backend/

> L2 | 父级: ../CLAUDE.md

成员清单

.claude/: RuoYi-Vue-Plus 上游 Claude Code 协作配置，随锁定源码快照保留。
.codex/: RuoYi-Vue-Plus 上游 Codex 协作配置，随锁定源码快照保留。
.editorconfig: 后端源码编辑器格式基线。
.gitattributes: RuoYi-Vue-Plus 上游文本属性约定。
.gitee/: 上游 Gitee 仓库模板与自动化元数据，作为来源快照保留。
.gitignore: Maven、IDE 与本地运行产物排除规则。
.mvn/: Maven Wrapper 运行时配置，保证后端构建入口可复现。
.run/: IntelliJ IDEA 上游运行配置样例。
LICENSE: RuoYi-Vue-Plus MIT 许可证原文，必须随源码与交付物保留。
README.md: RuoYi-Vue-Plus 上游项目说明与模块导航。
mvnw: POSIX Maven Wrapper，是 backend 构建、测试与后续模块门禁的统一入口。
mvnw.cmd: Windows Maven Wrapper，与 POSIX 入口保持同一 Maven 分发版本。
pom.xml: Maven 聚合根，集中声明 Java 21、Spring Boot 4.1、各 RuoYi 子模块、T02 JSON Schema validator 与 ruoyi-enterprise 内部模块版本。
ruoyi-admin/: Spring Boot 应用装配层，承载 T01/T02 验收并装配 ruoyi-enterprise 运行依赖；局部地图见 `ruoyi-admin/CLAUDE.md`。
ruoyi-api/: 模块间 API 契约层，保持领域模块不经 Controller/Mapper 横向耦合。
ruoyi-common/: RuoYi 公共基础设施与框架能力；ruoyi-common-security 对企业 API 保留登录校验，并把固定 client/device 裁决下沉到可信 Token session。
ruoyi-extend/: 监控、任务等可选扩展模块，MVP 按详细设计裁剪非必要运行能力。
ruoyi-modules/: 业务模块聚合层，包含边界独立的 `ruoyi-enterprise` PostgreSQL/Redis、crypto/revision/audit、identity/PKCE/device/model 纵向模块。
script/: RuoYi 上游数据库与部署辅助脚本，企业迁移真源后续由 Flyway 独立管理。

本目录是锁定提交 `7180b529776834fee912113b23f0bd7a387a8222` 的源码快照，不含上游 `.git`。企业改动必须保持 Maven 模块边界，并在触及业务文件时补齐对应 L3 契约。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
