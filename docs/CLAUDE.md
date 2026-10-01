# docs/

> L2 | 父级: ../CLAUDE.md

成员清单

dsh-compatibility.md: DSH 升级检查入口，记录当前 npm/Web 基线、上游依赖契约与本地代码/测试映射、历史夹具边界、逐项验收流程及 OAuth 接缝删除条件。
dsh-020-rc1-compatibility-20260929.md: DSH 0.2.0-rc.1 兼容门禁、个人账号模型 row 适配与 beta.15 隔离验证证据，区分本地制品和 npm 发布状态。
dsh-017-alpha1-compatibility-20260922.md: DSH 0.1.7-alpha.1 目标 runtime 的 Web/MCP 行为验收、当前 pluginManager/SettingsForms 适配及未覆盖范围。
dsh-017-rc1-compatibility-20260924.md: DSH 0.1.7-rc.1 目标 runtime 的 Web/MCP 行为验收、Release notes 对照、必要依赖适配及未覆盖范围。
v1-product-feature-catalog.md: V1 产品功能真源，汇总身份、LDAP 用户/组目录接入、模型、授权、配额、限流、插件安装配置、设备与审计的交付状态、关键语义、发布门禁和明确非目标。
plugin-signing-e2e-20260909.md: 已退役上传/验签链路的历史验收记录；当前安装配置模式以详细设计第 11 节为准，原复现脚本已删除。
plugin-market-e2e-20260917.md: 当前 Server 与真实 npm Harness/Chromium 的插件联合验收，记录 10 项通过、原生 pnpm 构建审批前提、复现命令和安装源/原生窗口实测边界。
v1-e2e-acceptance.md: V1 发布验收执行真源，以真实部署、LDAP/OIDC、锁定 Harness/Desktop 和浏览器场景覆盖全部冻结能力，并记录隔离、恢复与逐项证据。
owndsh-work-platform.md: 产品预研，定义企业工作平台形态、能力边界、演进阶段与商业方向。
owndsh-governance-mvp-design.md: MVP 实施真源，定义冻结决策、模块、API、数据表、测试、T00-T23 顺序和验收标准；插件已切换到安装配置模式，早期上传记录仅作历史证据。
phase-2-product-console-design.md: 第二阶段产品化实施真源，冻结 TanStack/Beautiful UI 控制台、成员多身份、LDAP 目录组映射、集合授权，以及 TOKEN 多窗口、组织级供应商与其他资源 RATE 瞬时限流结构。
mcp-management-design.md: MCP 历史详细设计入口，保留公共连接、授权、数据库和管理面背景；曝光与检索以 mcp-pi-adaptation-design.md 为现行真源。
mcp-runtime-design.md: MCP 历史端侧实施规格，保留身份/凭据、官方 SDK v2 OAuth、连接与撤销状态机及 local API 边界；曝光与检索以 Pi 适配设计为准。
mcp-implementation-plan.md: MCP 历史开发任务与验收记录，保留连接/OAuth/资源证据；新的曝光、检索和 DSH 模式矩阵以 mcp-pi-adaptation-design.md 为准。
mcp-pi-adaptation-design.md: 借鉴 Pi 的 MCP 曝光与检索目标设计，以 DSH 策略和实际可用性为准，定义 full/search 退役、模式适配、英文检索、结构化字段映射与 DSH 错误契约，不要求 Pi 完全兼容。
mcp-alpha2-web-e2e-20260922.md: alpha.2 真实 Web/AgentLoop 兼容验收，记录分页/资源/按需加载/SDK OAuth/禁用管理页、接缝修复、升级差异与可复现证据。
mcp-structured-web-e2e-20261001.md: 当前 MCP structuredContent Web/AgentLoop 专项验收，记录 native/ptc/both 模式、outputSchema、A→B 字段组合、无 schema 对象保留、isError 处理、执行命令和证据边界。
desktop-2.0.3-harness-rc2-migration.md: 历史 Desktop 2.0.3/Harness rc.2 迁移证据，记录当时的派生锁、上游变化、企业适配与门禁结果；当前兼容范围见 dsh-compatibility.md。
gateway-real-model-validation-20260906.md: V29 与取消修复的 10 次真实 Responses 调用证据，记录 Spring flush 根因、667 毫秒取消清理、108 项后端回归及已获准请求超额结算规则。
t00-baseline-acceptance.md: T00 独立验收证据，记录初始导入与 rc.7 重新基线的环境、命令、真实 consumer 和退出结论。
t01-technical-spike-acceptance.md: T01 独立验收证据，保留 Typert 路线误判分析并记录官方插件路线、正式模块、测试与真实 Harness Web 结果。
t02-contract-foundation-acceptance.md: T02 独立验收证据，记录 OpenAPI 真源、跨语言生成、严格 fixture、真实包消费和版本锁结论。
t03-server-database-acceptance.md: T03 独立验收证据，记录 PostgreSQL migration、RBAC、密码学、revision 与审计事务结果。
t04-identity-adapter-acceptance.md: T04 独立验收证据，记录三类身份 adapter、绑定/组映射、管理 API、cursor、协议与秘密隔离结果。
t05-pkce-device-acceptance.md: T05 独立验收证据，记录 PKCE/Redis 原子状态、Sa-Token terminal、验证码、设备生命周期，以及 T22 两阶段首次改密修订。
t06-harness-platform-client-acceptance.md: T06 独立验收证据，记录 platform-client Service、Token/installation 边界、刷新退避、本地 API/SSE、tgz consumer 与锁定 Harness 组合结果。
t07-employee-login-ui-acceptance.md: T07 独立验收证据，记录标准插件唯一交付、官方 settings Server 持久化、shell.overlay 全局门禁、失效重锁和宿主零修改。
t08-model-management-acceptance.md: T08 独立验收证据，记录模型治理 API、provider 密钥隔离、默认授权解析、PostgreSQL 事务与 bootstrap 模型目录。
t09-quota-management-acceptance.md: T09 独立验收证据，记录叠加配额、冻结时区、并发预留、Redis lease、结算恢复、用量协议与锁序审阅。
t10-model-gateway-acceptance.md: T10 独立验收证据，记录请求级授权、三协议透明 SSE、精确伪拒绝重试、2xx 后 SENT、配额终态、审计原子性与敏感信息隔离。
t11-harness-model-integration-acceptance.md: T11 独立验收证据，记录 rc.7 官方 dsh-llm-pi-ai、动态三协议 profile/default、本机认证代理、真实 ctx.llm 流与 Agent 瞬时失败恢复。
t12-admin-console-acceptance.md: T12 独立验收证据，记录管理 PKCE、治理纵向页面、真实 Server E2E、CAS 恢复、密钥隔离和跨端门禁。
t13-plugin-server-acceptance.md: T13 独立验收证据，记录流式验包、JCS/Ed25519、CAS、状态/分配、下载授权、库存、协议与真实 PostgreSQL 事务结果。
t14-plugin-client-acceptance.md: T14 独立验收证据，记录下载验签、官方 CLI argv、原子状态、重启确认、回滚、树外 consumer 与真实 rc.7 CLI 结果。
t15-plugin-pages-acceptance.md: T15 独立验收证据，记录管理插件页面、完整 assignment CAS、设备 inventory、员工插件 tab 与真实 rc.7 重启闭环。
t16-session-server-acceptance.md: T16 独立验收证据，记录官方 format v0、精确 JSONL/hash、源设备并发复制、AES-GCM、正文权限、tombstone 与 retention。
t19-audit-closure-acceptance.md: T19 独立验收证据，记录 30-action metadata 白名单、requestId 关联、只读权限、retention、用户治理和 heartbeat 防洪。
t20-security-fault-acceptance.md: T20 独立验收证据，记录分层安全上限、drain、秘密扫描、服务/磁盘故障与四类恢复演练。
t21-deployment-delivery-acceptance.md: T21 独立验收证据，区分当前 HTTP Compose 静态回归与历史 TLS 全量演练，并记录一次性管理员、secret、健康检查、数据/key 分离恢复、升级与仅应用回滚。
t22-manual-acceptance.md: T22 人工验收真源，记录自动总编排退役决策、单后端/单 Harness 启动方式与逐功能确认清单。
assets/: 无密钥验收与社区展示媒体，保存 T05、T07、T12、T15、T18、T19 的真实页面流程截图/GIF，以及维护者提供的社区介绍原图；局部地图见 assets/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
