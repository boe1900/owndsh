# Enterprise Agent Platform - 企业 Agent 管理与本地 Harness 集成平台

Java 21 + Spring Boot 4.1 + Sa-Token + PostgreSQL + React 19 + TypeScript + DeepSeek Harness 插件

<directory>
admin-web/ - plus-ui React 管理端锁定源码，T12 承载企业治理页面
backend/ - RuoYi-Vue-Plus 后端锁定源码，T03 起承载 ruoyi-enterprise 模块
docs/ - 产品预研、MVP 实施规格与逐任务验收证据
harness-plugin/ - 独立 pnpm workspace，T01 已按官方 bundle/Host/Client 扩展点建立企业插件技术基线
scripts/ - 开发环境初始化脚本（PowerShell、POSIX shell）
upstream/ - 第三方源码地址与精确版本锁，不保存第三方源码
</directory>

<config>
AGENTS.md - Agent 工作规则与 GEB 文档协议
README.md - 产品定位、仓库边界、文档入口与开发准备方式
.gitignore - 密钥、依赖、构建产物和本机文件排除规则
.gitattributes - 跨平台文本与换行约定
</config>

T00 建立上述三个源码与插件工作区，T01 验证官方插件发布、Host/Client 协作和关键框架语义；`contracts/` 和 `deploy/` 仍分别由 T02、T21 创建。第三方源码只在产品目录保存无 Git 元数据的锁定快照，同级 `deepseek-harness/` 始终是只读开发依赖。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
