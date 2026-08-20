# Enterprise Agent Platform - 企业 Agent 管理与本地 Harness 集成平台

Java 21 + Spring Boot 4.1 + Sa-Token + PostgreSQL + React 19 + TypeScript + DeepSeek Harness 插件

<directory>
admin-web/ - plus-ui React 管理端锁定源码，承载 enterprise-admin PKCE、动态权限路由与企业治理页面
backend/ - RuoYi-Vue-Plus 后端锁定源码，T03 起承载 ruoyi-enterprise 模块
contracts/ - OpenAPI 3.1 协议真源、跨语言 schema 和 fixture 验收
deploy/ - Linux amd64 单机 release、TLS Compose、一次性初始化与备份/恢复/升级/回滚交付
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

T00 建立三个上游源码与插件工作区，T01 验证官方插件扩展面，T02 建立跨端协议真源，T03 建立 PostgreSQL/密码学/revision/审计基础，T04 建立身份适配器与治理 API，T05 建立 PKCE/Sa-Token/设备生命周期，T06 建立 Harness 内存 Token、installation、bootstrap 刷新与同源控制面，T07 通过官方 Settings/sidebar/onboarding slot 交付桌面员工登录 UI，T08 建立 provider/model/grant 管理与 bootstrap 模型目录，T09 建立叠加配额、PostgreSQL reservation、Redis lease、结算恢复和用量查询，T10 建立请求级模型授权、DeepSeek-compatible upstream、OpenAI SSE、计费终态和双审计，T11 通过官方 rc.7 `ctx.llm` 建立动态企业目录、default sentinel、中心直连和无本地上游 Key 模型流，T12 建立 enterprise-admin PKCE、动态权限路由及身份/设备/模型/授权/配额/用量管理控制台，T13 建立受控 tgz 验包、JCS/Ed25519 签名、CAS 制品、发布/分配、逐请求下载授权与设备库存服务端，T14 通过官方 rc.7 subprocess/inventory 建立受管插件下载验签、CLI 调和、重启确认、库存与回滚客户端，T15 建立管理端插件纵向工作台与桌面员工插件状态 tab，T16 建立官方 format v0 精确 JSONL/hash、AES-GCM、并发远端副本、正文权限、tombstone 与 retention 服务端，T17 建立基于官方 rc.7 Session/Persistence 的 dirty queue、确认游标、断点退避、远端列表与新 ID 耐久恢复客户端。第三方源码只在产品目录保存无 Git 元数据的锁定快照，同级 `deepseek-harness/` 始终是只读开发依赖。

T18 在 T16/T17 Session 纵向边界上交付管理 metadata/正文/删除页和桌面同步/恢复/删除 tab，并以耐久 `DELETED` 游标阻止 Harness 重启后自动重传。T19 建立 30-action 显式 metadata 白名单、tenant 隔离审计查询、365 天有界 retention、用户治理事务接缝和 heartbeat 防洪。T20 建立默认同源 CORS、无已知 JWT secret、分层请求体上限、graceful drain、未知故障日志隔离、CI 秘密扫描和 PostgreSQL/Redis/artifact/key 恢复演练。T21 建立锁定 Linux amd64 release、TLS Compose、一次性管理员、secret、健康检查、备份恢复、升级与仅应用回滚；T22 是唯一下一项。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
