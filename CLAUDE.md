# OwnDsh - 企业 Agent 管理与本地 Harness 集成平台

Java 21 + Spring Boot 4.1 + Sa-Token + PostgreSQL + React 19 + TypeScript + DeepSeek Harness 插件

<directory>
.github/ - GitHub Actions 自动验证并发布 GHCR 前后端测试镜像、可下载插件包与 npm next 插件
server/ - OwnDsh 后端锁定源码，T03 起承载 owndsh-enterprise 模块
console/ - 第二阶段独立 Vite/TanStack 产品控制台，使用静态路由与 OpenAPI Fetch client，不依赖旧 Umi 管理端
website/ - 独立零依赖静态官网，复用品牌与真实产品截图，以 Node 白名单构建发布到 Cloudflare Pages，不依赖控制台或后端运行时
contracts/ - OpenAPI 3.1 协议真源、跨语言 schema 和 fixture 验收
deploy/ - Linux amd64 单机 release、HTTP Compose、一次性初始化与备份/恢复/升级/回滚交付；TLS 由部署方终止
docs/ - 产品预研、MVP 实施规格与逐任务验收证据
plugin/ - 独立 pnpm workspace，构建标准 `owndsh-plugin`；独立安装或由外部 owndsh-desktop 消费 npm 包，只使用官方扩展点，不维护 Harness Web UI 分叉
scripts/ - 开发环境初始化脚本（PowerShell、POSIX shell）
upstream/ - 以 DSH Desktop 为发行真源的第三方源码地址与精确派生版本锁，不保存第三方源码
</directory>

<config>
AGENTS.md - Agent 工作规则与 GEB 文档协议
README.md - 面向管理员与员工的开源入口，提供产品定位、自托管部署、插件接入、日常使用与排障路径
docker-compose.yml - 根目录零配置 Compose 入口，复用 deploy/compose 拓扑并加载 .env.example 默认环境
.env.example - GHCR next 镜像、`admin/owndsh` 与其他运行参数的可选环境变量覆盖模板
.gitignore - 密钥、依赖、构建产物和本机文件排除规则
.dockerignore - Server/Console 共用构建上下文边界，排除已迁出 desktop 的本地缓存、本机状态、密钥与制品
.gitattributes - 跨平台文本与换行约定
</config>

T00 建立上游源码与插件工作区，T01 验证官方插件扩展面，T02 建立跨端协议真源，T03 建立 PostgreSQL/密码学/revision/审计基础，T04 建立身份适配器与治理 API，T05 建立 PKCE/Sa-Token/设备生命周期，T06 建立 Harness 内存 Access Token、Host Refresh Grant、installation、bootstrap 刷新与同源控制面，T07 通过官方 Settings/shell.overlay slot 交付 Server 配置与登录门禁，T08 建立 provider/model/grant 管理与 bootstrap 模型目录，T09 建立叠加配额、PostgreSQL reservation、Redis lease、结算恢复和用量查询，T10 建立请求级模型授权、三协议透明 upstream、计费终态和双审计，T11 直接挂载官方 rc.2 `dsh-llm-pi-ai`，建立 reasoningEfforts 动态目录、default sentinel、三协议模型流和本机认证代理，T12 建立 enterprise-admin PKCE、动态权限路由及身份/设备/模型/授权/配额/用量管理控制台，T13 插件服务端已收敛为安装配置登记、发布/可见范围、安装前授权和设备库存，T14 通过官方 rc.2 subprocess/inventory 与 Desktop `desktopPnpm` 建立受管插件配置安装、CLI 调和、重启确认、库存与回滚客户端，T15 建立管理端插件纵向工作台与桌面员工插件状态 tab，T16 建立官方 format v0 精确 JSONL/hash、AES-GCM、并发远端副本、正文权限、tombstone 与 retention 服务端，T17 建立基于官方 rc.2 Session/Persistence 的 dirty queue、确认游标、断点退避、远端列表与新 ID 耐久恢复客户端。早期源码验证基线为 DSH Desktop 2.0.3 / Harness 0.1.1-rc.2，upstream 锁与同级只读 checkout 保留该历史夹具；当前插件使用 npm Harness 0.1.7-rc.1，Web 行为验收以该版本为准。发布 peers、实际宿主身份和已验证范围分别核对，caret 范围不等于兼容性验收。

DSH 升级入口：[依赖契约与升级检查表](docs/dsh-compatibility.md)。新增或修改上游服务、hook、slot、profile row 或 CLI 接入时，同步更新契约、验证入口和接缝删除条件；Web/Desktop 与真实供应商的覆盖范围分别记录。

模型协议法则：`@deepseek-ai/dsh-llm-pi-ai` 是客户端唯一协议实现，拥有消息、tools、reasoning、replay、SSE、通用重试与 provider 兼容语义；企业层只负责认证代理、授权、配额、审计、受管模型 ID 覆盖和上游密钥注入，不增加 provider 特定重试。后续模型能力优先升级锁定 Harness/官方依赖，禁止在企业代码中复制协议 adapter 或引入第二套 AI 抽象。

转发计量法则：V29 将实测 Token 与配额扣额分开，未知 usage 不进入实测总计。发送前提交 SENT/accepted 意图，明确 4xx 拒绝（不含 408）释放，响应丢失按未知用量记录；最终 usage 先写独立快照，终态事务失败后恢复任务按该快照结算。租约覆盖等待响应头与整个流，静默上游期间串行发送 SSE 心跳，取消先关闭上游再幂等结算。Token 允许已获准请求超额全额结算，额度耗尽后拒绝新请求；并发在途请求均可完成，不承诺固定超额上限。

T18 在 T16/T17 Session 纵向边界上交付管理 metadata/正文/删除页和桌面同步/恢复/删除 tab，并以耐久 `DELETED` 游标阻止 Harness 重启后自动重传。T19 建立封闭 action metadata 白名单、tenant 隔离审计查询、365 天有界 retention、用户治理事务接缝和 heartbeat 防洪。T20 建立默认同源 CORS、无已知 JWT secret、分层请求体上限、graceful drain、未知故障日志隔离、CI 秘密扫描和 PostgreSQL/Redis/key 恢复演练。T21 建立锁定 Linux amd64 release、HTTP Compose、一次性管理员、secret、健康检查、备份恢复、升级与仅应用回滚；PostgreSQL 只创建数据库/账号，库内 V0 基础表、种子数据与后续迁移统一随 Server 由 Flyway 执行，初始管理员仍由幂等 bootstrap 创建；TLS 交给部署方现有网关，应用日志仅输出 stdout/stderr，采集保留交给运行平台。T22 退役跨模块自动总编排，改由单后端、单 Harness 的无时限本地环境逐功能人工验收；T23 在 T22 人工确认完成前不启动。

第二阶段 P2-00 至 P2-07 已完成设计冻结、独立 `console`、Beautiful UI 产品壳、PKCE/固定角色路由、模型与访问策略、插件、MCP、成员与多身份，以及权限裁剪的用量/审计/运行异常和身份接入；控制台产品入口按模型、访问策略、插件、MCP、成员、活动记录分列，身份源归入成员，LDAP 组映射绑定 LDAP 行操作，不提供设置或系统页面。P2-08 已完成真实 Harness/Desktop 模型调用、Organization/Member/RPM/并发、五角色矩阵、身份源、静态资源切换与受管插件安装/升级/回滚/卸载 E2E。P2-08A 已建立扁平用户组/模型集、集合授权，以及 Organization/Member × All Models/Model Set/Model 的 TOKEN/RATE 互斥策略，并允许 Organization × Provider 的共享 RATE 上限；四窗口 Token 走 PostgreSQL 预留，RPM/并发走既有 Redis lease，重叠策略已由锁定 Harness E2E 覆盖。P2-08B 已实现 LDAP 单人导入、组目录有界发现与产品用户组显式映射，不扩展目录镜像或定时同步；V1 Session 客户端已停用，上游 429 在 HTTP 提交前区分瞬时限流与硬额度并保留 `Retry-After`。P2-09 已移除旧管理前端，生产与开发均只保留 `console`。

P2-08C 将产品控制台会话收敛为服务端 Sa-Token 与 HttpOnly/SameSite=Strict host-only Cookie；HTTPS 使用 `__Host-enterprise-admin` 与 Secure，HTTP 使用 `enterprise-admin`。管理端以 shadcn authentication 双栏骨架和产品 tokens 原生承载 LOCAL/LDAP 登录，多个 OIDC 仍按身份源独立跳转。浏览器 JavaScript 不读取或保存 Token，管理 API Filter 在 MVC 权限注解前桥接协议对应 Cookie，新标签直接复用会话；注销和本人改密由服务端撤销会话并清 Cookie，其他标签在下次请求或刷新时返回登录。Desktop/Harness Host 使用内存 Bearer Access Token 与官方 credentials Refresh Grant。

员工客户端发行规则：标准 `owndsh-plugin` 继续独立发布；可选 Pake 客户端已迁至 `boe1900/owndsh-desktop`，从 npm 消费官方 Harness 与插件，独立构建 macOS Intel/ARM 与 Windows x64，版本锁和窗口/服务生命周期由桌面仓库管理，不依赖社区 Desktop。桌面 profile 独立存放于应用数据目录，不预填 Server，不随包携带用户配置。插件零业务配置可安装，首次启动以官方 `shell.overlay` 全屏要求填写 HTTP(S) Server 地址并登录，地址写入 Harness 官方 settings；协议安全由部署方决定，插件只校验 origin 结构。Access Token 只在 Host 内存，30 天单次轮换 Refresh Token 只进入官方 credentials provider；Desktop/CLI/Web profile 重启后进行一次静默恢复；闲置时无企业 SSE、状态轮询或提前续期。请求时按需轮换 Access Token，服务端 401 最多续期重放一次；网络错误保留 Grant，用户重试恢复。UI 复用宿主模型/凭据/设置事件读取本地状态，登录期间只作有截止时间的临时查询。登录过期/设备撤销重新阻断。安装、更新、卸载均通过 DSH 0.1.7 官方 `pluginManager`；Desktop 有 `desktopActions.requestRestart()` 时复用官方立即/稍后重启交互。

服务地址边界：账号设置只读显示 Server；退出登录后在门禁修改。Host 将运行时修改收敛到无活动会话时的凭据清理与官方 settings 写入，保存与登录互斥；浏览器在服务/账号切换时丢弃旧请求结果。

员工 UI 入口：账号信息与退出登录集中在 OwnDsh 设置 → 账号；插件仅注册 settings.section 和 shell.overlay，不占用宿主 sidebar.footer.action。登录门禁、失效恢复与设置内确认退出保留。

企业插件市场：管理员只登记 npm 精确版本、GitHub 固定 commit 或 tgz URL，源码仓库与安装地址分离；卡片按产品原型组织无图标等高网格、分类/搜索与独立操作按钮，四色状态配悬停提示，只有更高版本以黄色微闪提醒；保留固定版本详情确认和安装后重启。平台只管理发布、ALL/USER 可见范围、逐次安装授权和库存，宿主 pnpm 独占依赖与构建策略。V34 清空旧上传目录/范围/库存并删除制品列，无旧协议兼容；客户端状态使用 plugin-installations.json。


MCP 员工能力仍在唯一 `owndsh-plugin` 的 OwnDsh 设置中；公共配置和服务授权归 Console/Server，用户秘密归 Host credentials。MCP/OAuth 各地址统一接受管理员指定的 HTTP(S)，协议、发现、PKCE、token exchange、refresh、协商与分页均由官方 SDK/client 执行。端侧复用 Harness `0.1.7-rc.1` 官方 MCP client 的独立 fiber，并挂载官方 `dsh-mcp-resources`，按 Agent 搜索累加、显式释放和本步调用快照呈现工具；无自动 LRU/16工具/64KiB会话硬限。OwnDsh 只绑定凭据 owner/target、保存官方 SDK 的 client information/tokens 与短生命周期 discovery state/verifier，并提供系统浏览器和本机 loopback callback，不复制第二套 OAuth 协议。实现进度与官方 SDK v2 兼容性见 docs/mcp-implementation-plan.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
