# Enterprise Agent Platform - 企业 Agent 管理与本地 Harness 集成平台

Java 21 + Spring Boot 4.1 + Sa-Token + PostgreSQL + React 19 + TypeScript + DeepSeek Harness 插件

<directory>
admin-web/ - plus-ui React 管理端锁定源码，T12 承载企业治理页面
backend/ - RuoYi-Vue-Plus 后端锁定源码，T03 起承载 ruoyi-enterprise 模块
contracts/ - OpenAPI 3.1 协议真源、跨语言 schema 和 fixture 验收
docs/ - 产品预研、MVP 实施规格与逐任务验收证据
harness-plugin/ - 独立 pnpm workspace，按官方 Host/Client 扩展点构建企业插件并生成 TypeScript/Zod 协议
scripts/ - 开发环境初始化脚本（PowerShell、POSIX shell）
upstream/ - 第三方源码地址与精确版本锁，不保存第三方源码
</directory>

<config>
AGENTS.md - Agent 工作规则与 GEB 文档协议
README.md - 产品定位、仓库边界、文档入口与开发准备方式
.gitignore - 密钥、依赖、构建产物和本机文件排除规则
.gitattributes - 跨平台文本与换行约定
</config>

T00 建立三个上游源码与插件工作区，T01 验证官方插件扩展面，T02 建立跨端协议真源，T03 建立 PostgreSQL/密码学/revision/审计基础，T04 建立身份适配器与治理 API，T05 建立 PKCE/Sa-Token/设备生命周期，T06 建立 Harness 内存 Token、installation、bootstrap 刷新与同源控制面，T07 通过官方 Settings/sidebar/onboarding slot 交付桌面员工登录 UI，T08 建立 provider/model/grant 管理与 bootstrap 模型目录，T09 建立叠加配额、PostgreSQL reservation、Redis lease、结算恢复和用量查询，T10 建立请求级模型授权、DeepSeek-compatible upstream、OpenAI SSE、计费终态和双审计；`deploy/` 仍由 T21 创建。第三方源码只在产品目录保存无 Git 元数据的锁定快照，同级 `deepseek-harness/` 始终是只读开发依赖。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
