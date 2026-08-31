# Enterprise Agent Platform

Enterprise Agent Platform 是基于 DeepSeek Harness 构建的企业 Agent 管理平台。员工在本机运行 Harness，中心平台负责企业身份、受管模型、配额、插件分发、会话副本和审计，不远程执行员工工具，也不挂载员工工作区。

本仓库只保存企业产品自行开发的后台、管理端、Harness 企业插件、部署配置和文档，不复制或 fork DSH Desktop/DeepSeek Harness 源码。DSH Desktop 是发行基线，Harness 版本从其 gitlink 派生；精确 commit 分别记录在 [`upstream/dsh-desktop.lock.json`](upstream/dsh-desktop.lock.json) 和 [`upstream/deepseek-harness.lock.json`](upstream/deepseek-harness.lock.json)。

## 当前阶段

T00 至 T21 已完成：仓库包含锁定产品源码、Harness 官方插件 workspace、Java/TypeScript 同源 OpenAPI 3.1 协议、PostgreSQL/Redis 企业模块、桌面管理控制台、插件分发闭环、Session 端到端复制、审计闭环、安全/故障基线和 Linux `amd64` 单机交付。T22 正在使用单后端、单 Harness 本地环境逐功能人工验收；第二阶段 P2-01 已完成独立 Vite/TanStack 产品控制台骨架，下一任务为 P2-02 产品外壳。当前清单见 [`docs/t22-manual-acceptance.md`](docs/t22-manual-acceptance.md)，第二阶段见 [`docs/phase-2-product-console-design.md`](docs/phase-2-product-console-design.md)。

## 文档

- [企业 Agent 工作平台预研](docs/enterprise-agent-work-platform.md)：产品形态、可行性、边界和长期方向。
- [企业 Agent 治理平台 MVP 可执行详细设计](docs/enterprise-agent-governance-mvp-design.md)：冻结的技术决策、模块、接口、数据表、状态机、测试、T00-T23 实施顺序和验收标准。
- [第二阶段产品控制台与成员身份收敛详细设计](docs/phase-2-product-console-design.md)：冻结 TanStack/Beautiful UI 新前端、产品功能裁剪、静态角色路由、多身份成员及授权/限额模型。
- [Desktop 2.0.3 / Harness rc.2 基线迁移](docs/desktop-2.0.3-harness-rc2-migration.md)：Desktop 派生版本锁、插件影响、重试变化与 Web/Desktop 门禁证据。
- [T01 技术刺探验收记录](docs/t01-technical-spike-acceptance.md)：官方插件路线修正、正式模块、自动测试、真实 package consumer、Harness Web 与浏览器验收证据。
- [T02 协议骨架验收记录](docs/t02-contract-foundation-acceptance.md)：OpenAPI 真源、双语言生成与 fixture、稳定错误码和真实 tarball consumer 证据。
- [T03 Server 模块与数据库验收记录](docs/t03-server-database-acceptance.md)：PostgreSQL V1-V5、固定 RBAC、AES-GCM、revision CAS 与审计事务证据。
- [T04 身份适配器验收记录](docs/t04-identity-adapter-acceptance.md)：OIDC/LDAP/LOCAL、稳定绑定、组映射、管理 API、cursor 和秘密隔离证据。
- [T05 PKCE 与设备验收记录](docs/t05-pkce-device-acceptance.md)：Redis 一次性状态、固定 public client、Sa-Token 终端隔离、设备生命周期与公开登录页证据。
- [T06 Harness 平台客户端验收记录](docs/t06-harness-platform-client-acceptance.md)：Service 状态机、内存 Token、bootstrap 刷新、本地 JSON/SSE、真实 tgz consumer 与锁定 Harness 组合证据。
- [T07 员工登录 UI 验收记录](docs/t07-employee-login-ui-acceptance.md)：官方 Settings/sidebar/onboarding 路线、十态 UI、同源浏览器边界与真实 Harness 桌面流程证据。
- [T08 模型管理验收记录](docs/t08-model-management-acceptance.md)：provider/model/grant API、密钥隔离、PostgreSQL 默认解析、bootstrap 模型目录与跨端协议证据。
- [T09 配额管理验收记录](docs/t09-quota-management-acceptance.md)：叠加策略、冻结时区、并发预留、Redis lease、结算恢复、用量 API 与跨端协议证据。
- [T10 模型网关验收记录](docs/t10-model-gateway-acceptance.md)：请求级授权、DeepSeek SSE、配额终态、首字节错误、审计原子性与敏感信息隔离证据。
- [T11 Harness 模型链路验收记录](docs/t11-harness-model-integration-acceptance.md)：官方 rc.7 adapter、动态目录/default、真实 `ctx.llm` 模型流、错误矩阵与无本地上游 Key 证据。
- [T12 管理控制台验收记录](docs/t12-admin-console-acceptance.md)：enterprise-admin PKCE、动态权限路由、治理页面、真实 Server Playwright、CAS 恢复和密钥隔离证据。
- [T13 插件服务端验收记录](docs/t13-plugin-server-acceptance.md)：tgz 安全检查、JCS/Ed25519、CAS、发布分配、下载授权、库存、协议与真实 PostgreSQL 证据。
- [T14 插件客户端验收记录](docs/t14-plugin-client-acceptance.md)：受管下载验签、官方 CLI argv、原子状态、重启确认、回滚、树外 consumer 与真实 rc.7 CLI 证据。
- [T15 插件页面验收记录](docs/t15-plugin-pages-acceptance.md)：管理端插件纵向闭环、完整 assignment CAS、设备 inventory、员工插件 tab 与真实 rc.7 Harness 重启证据。
- [T16 Session 服务端验收记录](docs/t16-session-server-acceptance.md)：官方 format v0、精确 JSONL/hash、并发复制、AES-GCM、正文权限、tombstone 与 retention 证据。
- [T17 Session 客户端验收记录](docs/t17-session-client-acceptance.md)：dirty queue、确认游标、退避终态、树外 consumer 与锁定 rc.7 同步恢复证据。
- [T18 Session 页面验收记录](docs/t18-session-pages-acceptance.md)：管理正文权限/审计/tombstone、员工同步/恢复/删除与锁定 rc.7 重启不重传证据。
- [T19 审计闭环验收记录](docs/t19-audit-closure-acceptance.md)：30-action metadata 白名单、requestId 关联、只读权限、retention、用户治理和 heartbeat 防洪证据。
- [T20 安全与故障验收记录](docs/t20-security-fault-acceptance.md)：有界请求、同源 CORS、graceful drain、日志扫描、服务/磁盘故障与四类数据恢复证据。
- [T21 部署交付验收记录](docs/t21-deployment-delivery-acceptance.md)：Linux amd64 release、TLS Compose、一次性管理员、secret、健康检查、备份恢复、升级与仅应用回滚证据。
- [T22 人工功能验收](docs/t22-manual-acceptance.md)：单后端/单 Harness 启动方式、自动总编排退役决策与逐功能确认清单。

实现者先阅读 MVP 详细设计的第 1 至 21 节，再严格按照第 22 节任务依赖推进。发现设计矛盾时先修订设计并记录决定，不在代码中引入未经确认的替代方案。

## 计划目录

```text
enterprise-agent-platform/
  backend/                     # RuoYi-Vue-Plus 后台与 ruoyi-enterprise 模块
  admin-web/                   # plus-ui 6.X-React 管理端
  console-web/                 # 第二阶段独立 Vite/TanStack 产品控制台
  harness-plugin/              # 独立构建的 Harness 企业插件与 bundle
  contracts/                   # OpenAPI 协议真源
  deploy/                      # Compose、Nginx、安装和运维脚本
  docs/                        # 产品预研、详细设计和交付文档
  upstream/                    # 第三方仓库地址、版本和许可证记录，不存第三方源码
```

Harness 企业插件位于本仓库的 `harness-plugin/`，构建为预编译 `.tgz` bundle。普通 Web 通过 `dsh plugin --profile web add <bundle.tgz>` 安装；Desktop 通过其公开 profile/plugin command 服务管理当前 profile。插件只能依赖公开扩展点，不把修改后的第三方源码复制进本仓库。

## 上游关系

DSH Desktop 官方仓库：<https://github.com/anywhere-labs/dsh-desktop>

DeepSeek Harness 官方仓库：<https://github.com/deepseek-ai/deepseek-harness>

当前发行基线为 DSH Desktop `2.0.3`；其固定 Harness `0.1.1-rc.2`。Desktop 锁是主真源，Harness 锁必须与其 gitlink 完全一致。

开发工作区把官方 Harness clone 为本仓库的同级目录，不放入本仓库：

```text
agent-platform-workspace/
  dsh-desktop/                  # 官方 Desktop 发行 commit 与 Harness submodule
  deepseek-harness/             # 官方仓库的锁定 commit
  enterprise-agent-platform/    # 本仓库
```

首次准备 Desktop 发行基线运行：

```sh
node scripts/bootstrap-desktop.mjs
```

仅开发普通 Web Host 时可使用原 Harness bootstrap。脚本只在来源正确且工作区干净时切换版本。Windows 使用 PowerShell 7：

```powershell
pwsh -File scripts/bootstrap-harness.ps1
```

macOS/Linux 使用 POSIX shell：

```sh
./scripts/bootstrap-harness.sh
```

首次导入产品上游基线时运行：

```sh
node scripts/upstream-baseline.mjs verify-locks
node scripts/upstream-baseline.mjs import
```

`import` 只允许目标目录不存在时执行，绝不覆盖已进入产品开发的 `backend/` 或 `admin-web/`。日常校验使用 `node scripts/upstream-baseline.mjs verify`；T00 的实际环境、命令和退出证据记录在 [`docs/t00-baseline-acceptance.md`](docs/t00-baseline-acceptance.md)。

本项目不自动跟随上游默认分支。升级时先选择 Desktop 发行 commit，再从其 gitlink 派生 Harness 锁；随后运行企业登录、模型网关、插件安装、Session 同步和 Web/Desktop 组合测试。全部通过后，版本锁变更与必要适配在同一个 PR 提交。

日常开发不得修改同级 `deepseek-harness/`。确需验证官方尚未提供的扩展点时只能使用临时分支，最终结果必须形成官方可合并的通用 PR；产品任务等待包含该扩展点的新锁定 commit，不在本仓库长期维护 Harness patch。

## 本地人工验收

```sh
./scripts/local-demo.sh
```

该入口启动一套正式 release 后端和一个企业插件 Harness，不运行 Playwright、外部 fixture、多设备控制面或自动业务操作，也没有人工等待超时。终端会输出管理端、Harness 和 LOCAL 首次登录凭据；保持进程运行即可逐功能检查，按 `Ctrl+C` 清理本次隔离环境。

## 安全

仓库不得提交 `.env`、模型 API Key、OIDC client secret、LDAP manager 密码、平台 Token、master key、插件签名私钥、生产证书或真实 Session 数据。开发和测试只使用显式假数据及可撤销凭据。

平台启动必须由环境提供 `SA_TOKEN_JWT_SECRET_KEY`。CI 可以用 `node scripts/scan-sensitive-logs.mjs --literal-file <controlled-literals> <logs...>` 扫描测试日志；开发环境可用 `./scripts/t20-recovery-drill.sh` 重复隔离的恢复与故障演练。
