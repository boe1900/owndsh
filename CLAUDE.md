# Enterprise Agent Platform - 企业 Agent 管理与本地 Harness 集成平台

Java 21 + Spring Boot 4.1 + Sa-Token + PostgreSQL + React 19 + TypeScript + DeepSeek Harness 插件

<directory>
docs/ - 产品预研与 MVP 实施规格（2 个设计文档）
scripts/ - 开发环境初始化脚本（PowerShell、POSIX shell）
upstream/ - 第三方源码地址与精确版本锁，不保存第三方源码
</directory>

<config>
AGENTS.md - Agent 工作规则与 GEB 文档协议
README.md - 产品定位、仓库边界、文档入口与开发准备方式
.gitignore - 密钥、依赖、构建产物和本机文件排除规则
.gitattributes - 跨平台文本与换行约定
</config>

当前仓库只包含实施文档和上游准备工具。`backend/`、`admin-web/`、`harness-plugin/`、`contracts/` 与 `deploy/` 在详细设计对应任务开始时创建，并同步更新本文件与各模块的 `CLAUDE.md`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
