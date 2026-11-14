<!--
[INPUT]: 当前插件对 Harness/官方 MCP SDK 的实际接入、npm manifests/lockfile、构建脚本与已执行的验收证据。
[OUTPUT]: 提供依赖契约、上游变化到本地影响的映射、升级检查入口和临时接缝删除条件。
[POS]: DSH 升级的检查入口；代码地图负责定位，历史报告保存证据，本表只描述当前接入与已验证范围。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 依赖契约与升级检查表

升级 Harness 或官方 MCP SDK 时先读本文。Release notes 用于定位变化，目标版本的公开导出、实现和真实运行结果用于确认影响。接口名称未变、类型检查通过或 peer 范围允许安装，都不能单独证明行为兼容。

只维护当前接入，不为未上线的 MCP 保留旧开发版凭据兼容分支。历史升级报告保留当时的事实，不自动成为新版本的支持承诺。

认证接缝（2026-11-09）：系统浏览器授权仍使用既有 PKCE/随机端口 loopback，新增浏览器账号确认不改变 Host Token/installation 协议；仅 OwnDsh 回调选择无凭据 `/authorized` 交接，MCP 默认回调不受影响。独立桌面壳注册 `owndsh://open` 只负责窗口激活。源码、npm 插件制品和桌面 runtime 精确锁分别交付；本次源码检查不代表已发布或已通过原生安装包验收。现行设计和验证证据见[统一登录设计](unified-login-design.md)。

设备插件库存退役（2026-11-13）：源码已删除企业库存上报、对应 HTTP 接口、Console“设备状态”及同源“运行异常”；V58 删除 `ent_device_plugin` 快照表，旧库存审计仍可查询。官方 `pluginInventory` 继续用于 Remote 可选 Ego 能力检查，与退役的企业上报无关。本次退役不改变已发布 npm 插件或桌面制品，发布版本需独立核对。

远程会话操作补齐（2026-11-14，源码待发布）：Console 的原生 Markdown 复制控制器已绑定现有远端 transport，Host 精确准入 `/api/session.markdown` 和 `agentTeams/setEnabled`。隔离原生页面的系统剪贴板、普通 HTTP 备用复制、团队开启及确认关闭后的刷新回显通过。现有 npm `beta.21` 不含此修复，需同时更新 Console 和远端 Host 插件；仅更新 Java Server 无效。[本轮验收与发布边界](remote-session-actions-verification-20261114.md)。

远程原生导航补齐（2026-11-14，源码待发布）：Console 恢复官方 Plugins/Discover、自动化任务和完整 More，Host 新增 25 个精确 RPC 及两条 GET 图片路径。真实隔离 rc.3 Host 的插件升级重装、启停、索引源修改、任务 CRUD、运行记录及关页定时执行通过。Creator 保留原生创造模式草稿入口，动态插件审批、运行和新界面加载尚未接通；第三方 Client 与配置页面仍受固定 assembly 限制。现有 npm `beta.21` 和生产 Console 均未包含本轮变更，需配对更新。[原生导航验收](remote-native-navigation-verification-20261114.md)。

## 1. 当前基线与证据

升级核对：2026-11-13。当前源码迁移目标为 DSH `0.2.2-rc.3`（tag commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`），对照旧 `0.2.1-rc.5`。插件发布目标为 `0.1.0-beta.21`，Desktop 同步锁定官方 rc.3 与该插件版本。升级补验已通过，公开发布和实际自动更新单独记录。rc.5 使用历史发行物；只声明同版本 rc.3 Host 与 Console assembly 配对，不承诺交叉版本工作区。

| 项目 | 当前事实与真源 |
|---|---|
| 开发与发布依赖 | DSH 包精确锁定 `0.2.2-rc.3`，Cordis `4.1.0`、Schemastery `3.19.0`，MCP SDK `2.2.0`；要求 Node.js ≥24.9。DSH peers 精确版本，Cordis/Schemastery peers 为宿主同 minor 系列，官方运行类均 external。完整图见 manifests 与 `plugin/pnpm-lock.yaml`。未使用且目标不再发布的旧 `dsh-invariants` 开发依赖已移除。 |
| Console 固定资源 | 当前 rc.3 CLI 在临时 profile 中生成 61 个 Client 模块、166 项固定资源，较升级首轮恢复五个导航及预设模块；包含官方 `./assets/*` 导出资源与固定 Ego `0.9.14`。shell、会话、预览和 Markdown 的源码 hash 与唯一替换门禁保护适配，More 和预设选择使用官方原始客户端。 |
| 发行 Node 与基线元数据 | Console engines ≥24.15，Node 24.15 Debian glibc 构建镜像与本地缓存 fallback 共用精确 digest，生产 Nginx 仍为 Alpine；Host/插件仍 ≥24.9。离线包实际 Harness 版本取自 bundle peers 与 native-runtime 的精确交叉校验；旧源码版本/commit 只写独立 SOURCE_FIXTURE 字段。 |
| Console 检查 | 当前原生导航及预设扩展的生产构建、TypeScript 与 24 文件 /166 项测试通过；已删除 Creator 裁剪专用 hash 测试，保留三处官方菜单行为测试。升级首轮曾通过固定 Node 24.15 Debian glibc arm64 Docker 构建、测试和 Nginx 160 资源逐项 GET/hash；新增导航及预设后的 166 资源本轮仅在本机验证，未重跑 Docker 或 amd64。 |
| Remote 边界 | Host 三包门禁与密文 ready 共用单一 rc.3 应用版本，Controller 以 `ENT_REMOTE_DSH_VERSION` 拒绝旧 ready；Remote wire/hash 不变。`workspaceFiles/search` 会话 scope、新 `subagents/interruptByUser`、同文件有限版本媒体重定向已适配；真实 HTTP/WS 回归覆盖搜索越权、方法绑定及恶意媒体跳转。 |
| Host 与产品验收 | 最新 tgz 在 rc.3 Edge native/PTC 各 9 项 MCP 业务及各 3 项 structured 专项通过；两个隔离 rc.3 Host、新 Console 冷会话、流式对话、搜索、图片与断线恢复通过；Ego 原生右栏真实导航、密文画面与点击到达 Host 通过。使用本机模型协议 fixture 和同机多进程，外部真实模型、Desktop 安装包及 NAS 双机本轮未复验。详见 rc.3 迁移报告。 |

企业模型显式容量继续投影 bootstrap 的 `contextWindow/maxTokens`；缺省值继承官方 rc.3 的 1,000,000/128,000（旧版为 262,144/32,768）。DeepSeekSearch、OfficeKit 和新官方账号通知是原生可选能力，rc.3 升级未扩展为企业已验收功能。智能体团队的远程模式开关后来补验见 D18，该结果不代表真实多智能体任务验收。官方 MCP manager 没有 OAuth provider 注入口，不能替代现有 owner/target、SDK OAuth、企业租约和曝光策略。逐项差异与验证见 [rc.3 升级报告](dsh-022-rc3-compatibility-20261113.md)。

### Host Bridge spike（2026-11-08）

这次只验证官方 Harness Host 的业务接缝，不改变 OwnDsh Remote 协议，也不改当前业务数据。验证运行在官方 `0.2.1-rc.5` 安装 runtime 的隔离 `DSH_HOME` 中，用一个临时树外插件通过标准 `inject` 取得 Host 服务；Terminal 额外创建了一个临时 Agent 做只读查询并通过 `AgentHandle.dispose()` 释放，未创建 PTY 或执行命令；探针结束后进程已停止，仓库工作区保持干净。

| 探针 | 结果 | 证据 |
|---|---|---|
| `ctx.sessionController`、`ctx.workspaceFiles`、`ctx.terminalController`、`ctx.typertGateway` 注入 | 通过 | 实例分别为 `SessionController`、`WorkspaceFiles`、`TerminalController`、`TypertGatewayService`。 |
| Typert Host 注册表 | 通过 | `ctx.typert.local.list()` 列出 `session`、`workspaceFiles`、`terminal` 三个 namespace；包含 `session.list/create/follow/prompt`、`workspaceFiles.stat/read/readBytes/list/changes`、`terminal.shells/environment/create/attach/retain/close` 等方法。 |
| Session 无副作用查询 | 通过 | `sessionController.list({})` 返回 `{ items: [] }`；没有创建 Session 或 Agent。 |
| File 无副作用查询 | 通过 | `workspaceFiles.stat` 和 `read` 实际读取 `/etc/hosts`，返回绝对路径、版本、字节数和文本页；这证明 provider 可调用，不代表 OwnDsh 已开放该路径。 |
| Terminal 无副作用查询 | 通过 | `terminalController.list('probe-session')` 返回空列表；在隔离临时 Agent 下，`shells` 返回 `/bin/zsh`、`/bin/bash`，`environment` 返回 cwd 与输入/缓冲/尺寸/scrollback 限制；未创建 PTY。 |

当时的结论是 Harness 提供可调用的 Session/File/Terminal 服务，接缝风险已解除，而 OwnDsh 尚未接入。2026-11-11 的 [DSH 远程工作区实现](remote-dsh-workspace-design.md) 已改用官方 `/connect` owner Peer 与 HTTP/mux carrier，在真实双 Harness 中验证会话 prompt/流、文件和终端输入输出，不再建设第二套自定义业务 RPC。

`upstream/` 中的 [Desktop 锁](../upstream/dsh-desktop.lock.json)与 [Harness 锁](../upstream/deepseek-harness.lock.json)仍描述早期 Desktop `2.0.3` / Harness `0.1.1-rc.2` 源码夹具，参见[历史迁移记录](desktop-2.0.3-harness-rc2-migration.md)。它们不是当前 npm/Web 验证基线，也不证明当前插件兼容该旧版本。独立 OwnDsh Desktop 的发行运行时由桌面仓库管理，升级时必须记录其实际内置 Harness 版本。

## 2. 依赖矩阵

按上游变化匹配下面的编号，再定位代码和验证。公开 API 的签名检查与运行行为检查都要保留；字符串 ID、本地窄 port、`ctx.get()` 类型断言和 hook 顺序尤其容易绕过编译检查。

### 2.1 启动与 Host 服务

| 编号 / 上游依赖 | 当前依赖的契约 | 本地位置与验证入口 | 变化影响与升级检查 |
|---|---|---|---|
| D01 插件 manifest / Client loader / 包导出 | `dsh.bundle.patch`、`dsh.client.platform: web` 及 Client inject；浏览器通过 `window.__ModuleLoader__.load()` 装载 lazy-CJS factory。官方 Host 服务、React 和 UI primitives 使用宿主共享实例。 | [manifest](../plugin/packages/bundle/package.json)、[build.mjs](../plugin/packages/bundle/scripts/build.mjs)；[bundle 回归](../plugin/packages/bundle/tests/bundle.spec.ts)、目标 Host 启动。 | 导出路径、扫描方式、模块格式或服务身份变化会让插件不加载或产生重复实例。核对 exports、peers、external 和 Client 注入项，并用实际 tgz 安装。 |
| D02 base/web profile 与 row ID | 覆盖 `agent-default-model`；停用 `llm-deepseek`、`llm-deepseek-account`、`llm-pi-ai`、`ui-settings-models` 和新增的未受管连接入口 `mcp-manager`；插入 `owndsh`。`mcp-resources` 由目标 base 提供，不重复插入；启用官方 `plugin-market` 与 Client market 页面。 | [cordis.patch.yml](../plugin/packages/bundle/cordis.patch.yml)；bundle 回归、[Web E2E](../plugin/scripts/web-mcp.test.mjs)。 | 上游新增默认插件、改 row ID 或 layer 合并规则时，逐项检查目标 profile。官方 Discover 页面必须保持启用并能读取 OwnDsh index；智能体团队另验入口和功能。 |
| D03 Cordis / Schemastery / fiber | `inject`、`ctx.plugin/isolate/effect/on`；Cordis rc.3 的 fiber.config 为 raw，effectiveConfig 才是有效配置（本产品不读这些 internals）；fiber 等待/更新/释放和 schema 默认值；异步释放必须撤回工具、路由及旧身份连接。 | [Host 组合入口](../plugin/packages/bundle/src/index.ts)、[模型注册](../plugin/packages/llm-gateway/src/registration.ts)、[MCP runtime](../plugin/packages/bundle/src/mcp-runtime.ts)；完整检查、MCP/平台生命周期回归。 | 生命周期函数或更新语义变化可能留下旧能力或重复挂载。验证更新、登出、取消和 dispose；同一个服务不能解析成两份运行实例。 |
| D04 credentials provider | `credentialKey`、`readRecord/modifyRecord/deleteRecord` 与 GrantRecord；依赖 provider 原子修改语义。企业登录 Grant 和 MCP owner/target 记录分开，迟到写入受生命周期约束。 | [平台凭据](../plugin/packages/platform-client/src/platform-credentials.ts)、[MCP 凭据](../plugin/packages/bundle/src/mcp-oauth.ts)；[平台回归](../plugin/packages/platform-client/tests/platform-service.spec.ts)、[OAuth 回归](../plugin/packages/bundle/tests/mcp-oauth.spec.ts)、Web 重启恢复。 | 记录格式、原子性或持久化边界变化需验证刷新轮换、账号/目标隔离、撤销与重启恢复。不得把平台 Token 交给 MCP 或浏览器。 |
| D05 settings | 通过官方 `SettingsForms.configure({ auto: false })` 与 `update()` 写入 bundle Config 的 `baseUrl`、`mcp.desiredConnected`；volatile 更新由 `loader/volatile-update` 接收，账号状态仍由 OwnDsh Service 约束。 | [平台服务](../plugin/packages/platform-client/src/platform-service.ts)、[MCP runtime](../plugin/packages/bundle/src/mcp-runtime.ts)；平台回归、目标 Host 修改地址和重启。 | `SettingsForms` schema、volatile 标记或事件路径变化会造成配置丢失、连接意愿不生效或旧账号复活。核对保存失败、授权中修改、退出后修改及重启恢复。 |
| D06 webServer 与同源通道 | `webServer.register({kind, path, handler})`（新增 readResource 可用于未来删除本机静态 HTTP 回环，不能替代业务 POST/mux/owner admission） 返回注销函数；浏览器通过宿主同源通道访问 `/enterprise/api/v1/local`，返回脱敏 DTO。 | [Host 路由](../plugin/packages/platform-client/src/local-api.ts)、[浏览器 API](../plugin/packages/ui/src/local-api.ts)、MCP runtime；两侧 local-api 回归、Web 登录/MCP 操作。 | 路由挂载、路径前缀、鉴权或 origin 策略变化可能使所有 UI 动作失效。检查请求确实经过目标宿主的访问保护，插件释放后路由移除；原生 Node HTTP 路由测试不证明宿主保护仍生效。 |

### 2.2 模型、MCP 与按需加载

| 编号 / 上游依赖 | 当前依赖的契约 | 本地位置与验证入口 | 变化影响与升级检查 |
|---|---|---|---|
| D07 dsh-llm / dsh-llm-pi-ai | `APP_IDENTITY.version` 上报真实 Harness 版本；官方 provider profiles 承载三协议、headers、baseURL、reasoning、compat 和 default；隔离 settings 后动态更新 fiber，重试与消息协议归官方。 | [profiles](../plugin/packages/llm-gateway/src/profiles.ts)、[registration](../plugin/packages/llm-gateway/src/registration.ts)、[proxy](../plugin/packages/llm-gateway/src/proxy.ts)；[profiles 回归](../plugin/packages/llm-gateway/tests/profiles.spec.ts)、[proxy 回归](../plugin/packages/llm-gateway/tests/proxy.spec.ts)。 | profile 字段、URL 拼接、流错误、重试分类或调用快照变化需检查三协议请求与取消、动态模型、default、Retry-After、瞬时 429 与终态 quota。当前 MCP Web E2E 只使用 Chat Completions 桩，不覆盖完整模型矩阵。 |
| D08 dsh-mcp-client | none/API Key 走官方 `apply` + 独立 fiber，使用 `Config(raw)` 正规化 closeTimeoutMs/expandTemplates/reconnect 默认值、启动失败、发现与注册语义；API Key 原样放入指定 Header。 | MCP runtime 的 `reconcile`；[MCP 回归](../plugin/packages/bundle/tests/mcp-runtime.spec.ts)、Web E2E。 | transport/config/reconnect 或命名规则变化需验证发现、分页、重连、禁用/启用、定义更新和撤销；tools capability 缺失时不能强行请求 tools/list。 |
| D09 官方 MCP SDK v2 OAuth 连接 | OAuth 目前直接使用 `Client`、`StreamableHTTPClientTransport`、`auth()`；SDK 负责协商、分页、协议 OAuth 和重试，工具定义复用官方 `createMcpToolDefinition`。OwnDsh 组合工具列表变化、超时/取消及释放。 | MCP runtime 的 `connectOAuth`；MCP 回归、Web OAuth/分页/协商场景。 | SDK 更新必须同时看 transport/auth/listTools/callTool 行为、tools/list_changed 与任务支持。不能把 none/API Key 通过推定成 OAuth 通过，也不能把 SDK 2.x 的变化漏掉。 |
| D10 dsh-mcp-resources / systemPrompt 章节 | OAuth 连接通过 `mcpResources.register(server, provider)` 转交 list/templates/read；通过 `systemPrompt.section()`、`MCP_SERVERS` 顺序挂载服务器 instructions，关闭时注销。非 OAuth 路径由官方 client 管理。 | `connectOAuth`；MCP 回归、Web 资源和无工具服务器场景。 | provider 请求形状、cursor、URI、instructions 或章节生命周期变化需检查两种连接路径。资源共享工具与按需加载的业务工具是不同入口，业务工具隐藏不能代替资源验收。 |
| D11 OAuthClientProvider / loopback | `StoredOAuthTokens/StoredOAuthClientInformation`、issuer 上下文、失效 scopes、verifier 与 discovery state；回调 state 在 loopback 校验，`iss` 交给 SDK，discovery state 供 SDK 绑定授权服务器。 | [mcp-oauth.ts](../plugin/packages/bundle/src/mcp-oauth.ts)、[pkce.ts](../plugin/packages/platform-client/src/pkce.ts)；OAuth 回归、Web 刷新/重授权/重启。 | provider 新增可选方法也可能改变安全行为，必须读 SDK 警告。覆盖 401 刷新、invalid_grant、取消、账号切换、迟到写入和 callback 绑定；SDK 可以重试 401，不能沿用旧版“不重放”假设。 |
| D12 dsh-tools / Agent scope / 执行 hooks | canonical `register(definition,{when})` 与 `resolve()` 产生本步 `ResolvedToolSet`，传递给 assembly、SDK 和 batch execute；when 只判断静态 definition/scope/exposure，不在正式 assembly 刷新前按旧租约排除工具。官方 client 的注册 facade 保留 child registry 的注销生命周期。搜索目录仅按 Agent scope 查询；原有执行 guard 保留实时撤权。 | [mcp-tools.ts](../plugin/packages/bundle/src/mcp-tools.ts)；MCP 回归和 Web 按需加载场景。 | **重点检查行为**：native 冷启动无受管 schema，search 下一步加载并累加去重，release 下一步撤回但本步调用保持快照；PTC 非 hidden binding 保留搜索前按名调用策略，SDK 只列已选项。闲置租约在 assembly 刷新后同一步恢复；持续失效/定义替换仍拒执行，新 Agent 不继承集合。 |
| D13 system-prompt / PTC SDK 渲染 | native/PTC executor 分离，`run_code` 不在 registry。每次 resolve 的 `ToolActivationContext` 共用一次官方空 toolSet assembly 探测：传 Agent scope，不传 agent，避免工作目录初始化；只接受 native 空工具或 PTC 单 `run_code`。正式 hook 只改 `tools:sdk` 文本，逐项匹配 executor 包导出的 TS function-body/repl/script 或 Python renderer，不修改 presentation 的工具字段。 | mcp-tools 的 when 与 assemble hook；MCP 回归中的 native/ptc × TS/Python、conditional tool、本步快照及 scoped executor。 | **重点检查行为**：探测不刷新授权、不改变选择或本步呈现；缓存不跨 resolve。正式 SDK 严格使用相同 toolSet，未知格式拒绝。真实解释器及 preset 装配需目标 Host 验证，受控 binding 回归不等于解释器验收。 |

### 2.3 页面、安装与桌面宿主

| 编号 / 上游依赖 | 当前依赖的契约 | 本地位置与验证入口 | 变化影响与升级检查 |
|---|---|---|---|
| D14 Client slots / remote / ui-primitives | 注册 `settings.section`、`settings.launcher` 和访问门禁 `shell.overlay`；launcher 以 priority -100 覆盖原生 DeepSeek 账号入口，共用企业 store、原生 Menu 与退出确认，复用既有账号事件。设置包含账号/技能/MCP tabs；插件发现由官方 Plugins → Discover 页面提供。 | [client.tsx](../plugin/packages/ui/src/client.tsx)、[account-view.tsx](../plugin/packages/ui/src/account-view.tsx)；Client/UI/bundle 回归；[rc.5 账号入口联调证据](../.audit/account-launcher-local-evidence.json)。 | 检查底部账号展开/折叠、设置导航/快捷键、退出取消/确认、设置 tab、键盘导航、登录前后和断线恢复；官方 Discover 页面必须仍可用。 |
| D15 官方 pluginMarket / pluginManager / 自定义索引 | OwnDsh bundle 通过 loopback 代理以内存 Bearer 读取受保护的 `/enterprise/plugin-market/index.json`，并将代理 URL 写入官方 `pluginMarket.indexes`；Server 输出 DSH plugin market format 1 元数据和 npm 安装目标，安装事实由官方 Host 管理。 | [bundle](../plugin/packages/bundle/src/index.ts)、[PluginMarketController](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/plugin/web/PluginMarketController.java)；bundle 回归、Server API 合同。 | 检查索引 URL 去重、Server 切换后的旧 OwnDsh 索引清理、loopback 代理不会向 LAN 暴露、Bearer 失效后的读取拒绝、ACTIVE/PUBLISHED 投影和官方 Discover 安装门禁；不恢复第二套目录 UI。 |
| D16 官方重启与安装进度 | 官方 Discover 页面自行管理安装日志、取消、恢复和重启交互；OwnDsh 只保留整包卸载的宿主重启动作。 | [bundle](../plugin/packages/bundle/src/index.ts)；bundle 回归和目标 Desktop。 | Web/Desktop 的官方安装与重启语义需分别验证；Server 索引不可携带 assignment、inventory、token 或权限字段。 |
| D17 Console 原生工作区与可选 Ego 浏览器 | 构建锁定 Harness `0.2.2-rc.3` 与 Ego `0.9.14`，原始 Ego 客户端 SHA-256 为 `a49c16bc762a4f8091faac840bd3c2ec70fdb57a3eeed674175ba50f129c5520`。固定 factory 注入局部 fetch/EventSource，原生 IME/坐标逻辑复用；仅 CDP，禁用配置、登录桥和本机窗口。 | [构建适配](../console/scripts/ego-client.mjs)、[共享契约](../plugin/packages/contracts/src/ego.ts)、[Host policy](../plugin/packages/bundle/src/remote/ego-policy.ts)、[网络适配](../console/src/features/workspace/ego-network.ts)；Ego contract/input/network/Host suites。 | 升级任一客户端 hash、slot、控制器行为或 Ego HTTP route 时重审接缝，验证无插件/禁用/版本不符不阻断普通工作区，以及真实点击、IME、尺寸、断开/重连与 watcher 回收。API/模块通过不能代替双机浏览器验收。 |
| D18 原生会话 Markdown 与团队模式 | 固定 `dsh-session-log-export@0.2.2-rc.3` 的复制控制器通过现有 transport 读取 Markdown，成功响应须为 `text/markdown`。Host 只新增 GET/HEAD `/api/session.markdown?sessionId=…` 和 unary `agentTeams/setEnabled`，由官方 owner Peer 执行。团队状态沿用 `session/follow` 与 `session/projections`，不走 settings。 | [复制适配与测试](../console/scripts/session-markdown-client.mjs)、[网络边界回归](../plugin/packages/bundle/tests/remote-network-boundary.spec.ts)、[验收记录](remote-session-actions-verification-20261114.md)。 | 核对独立和聚合资源都注入固定控制器。验证系统剪贴板字节、非安全 HTTP fallback、错误 MIME 和读取失败，以及开关启停后的重新跟随；继续拒绝 ZIP、settings 和额外团队端点。Console 与 Host 插件均需交付。 |
| D19 Console 原生插件、任务、More 与预设 | 固定装配 `ui-plugin-manager`、`ui-plugin-market`、`ui-schedule`、`ui-entry-customization`、`ui-agent-preset`，More 完整保留创造模式草稿入口，预设组件恢复选择与模式标识。新增精确插件与 schedule RPC、两条 GET detail-file 图片路径；mutation 和事件交由同一官方 owner Peer，预设使用既有 `agentPresets/list/read/select`。 | [官方菜单行为测试](../console/scripts/entry-customization-client.test.mjs)、[精确边界测试](../plugin/packages/bundle/tests/remote-navigation-boundary.spec.ts)、[真实浏览器验收](remote-native-navigation-verification-20261114.md)。 | 核对五模块仍在 graph、Discover companion 显式启用、三处 More 的 cordis 草稿参数及不自动发送、预设选择与 Host Session 投影及只读模式标识一致、图片 GET query 和无 body、原生任务 CRUD/定时投递。创造模式入口不代表动态插件审批及运行已支持；保留 metadata 三项静态边界，拒绝动态 Client、通用 settings、凭据和版本豁免。 |

未启用的历史 Session 同步实现不作为当前发布能力验收；上游 Session/Agent 变化若影响 D12/D13 的执行上下文，仍必须检查。新增上游接入时补矩阵，不能只补 manifest。

## 3. 一次升级怎么执行

### 3.1 先判断影响

1. 记录目标 Harness tag/版本、官方 SDK 实际解析版本、插件 commit、运行面及 release notes；源码检查使用目标 tag 或目标 npm 包，避免读上游 main 后套到已发布版本。
2. 用矩阵编号标记每项上游变化，定位公开导出、默认 profile、hook 行为及新增功能。没有 release note 命中也要核对 D01/D02 和直接依赖导出。未读到或未验证的条目标记“未验证”。
3. 根据实际目标更新相关 workspace 的开发依赖、peers、锁文件、构建 external 与 profile patch；只在需要时调整宿主接缝。保留官方协议实现，不因升级恢复自写 OAuth 或模型 adapter。
4. 检查测试真正使用了哪个运行时。旧源码锁、旧 profile、同名 tgz 缓存和硬编码版本都可能让“通过”落在错误环境。

### 3.2 固定检查与按影响追加验收

更新依赖并生成锁文件后，从仓库根目录执行固定检查：

```sh
pnpm --dir plugin install --frozen-lockfile
pnpm --dir plugin run check
pnpm --dir plugin run pack:bundle
```

`check` 先类型检查，再构建和运行模块/workspace 测试。不要把 bundle 构建和读取 lib 的测试并行运行，构建会清空 lib。workspace 中针对同级旧 checkout 的校验仅证明历史源码锁一致，不证明目标 npm 运行时兼容。

每次升级都用目标 Harness 和本次 tgz，在隔离 DSH_HOME 中验证启动、Client 加载、企业登录和普通模型请求。优先复用 [web-mcp.test.mjs](../plugin/scripts/web-mcp.test.mjs) 覆盖 Web/MCP 主链路；按影响追加：

| 受影响编号 | 目标宿主必须补查的场景 |
|---|---|
| D03–D06、D11、D14 | 登录、取消、失效、登出/切换账号、修改 Server、重启恢复；检查路由和授权状态真实联动。 |
| D07 | 三协议模型、动态模型/default、流错误/取消、瞬时失败重试与终态 quota；记录请求而不只检查最终聊天文案。 |
| D08–D13 | none/API Key/OAuth 分开验证；分页、协商、资源/模板/读取、无工具服务器；搜索/释放/快照/撤销/隔离和 OAuth 失效恢复。涉及 PTC 则追加真实 TS/Python 解释器场景。 |
| D02、D14–D16 | 官方 Plugins → Discover 读取 OwnDsh 自定义 index，完成搜索、安装/更新/卸载与实际 profile 版本事实一致。涉及团队插件则单独验证团队启用与页面入口。 |
| D16 | 官方 Discover 的日志、取消、失败与重启交互；OwnDsh 整包卸载的确认与宿主重启语义。 |

已有入口的适用范围：

- Web/MCP 脚本读取 `OWNDSH_TEST_RUNTIME`（含目标 npm dsh 的目录）、`OWNDSH_TEST_PROFILE`（已装本次 tgz 的 web profile），可通过 `OWNDSH_PLAYWRIGHT_MODULE`、`OWNDSH_CHROMIUM_PATH` 指定浏览器依赖，通过 `OWNDSH_E2E_OUTPUT` 隔离证据。它复制 profile，并比对安装包 Host bundle 与当前构建产物的哈希；当前脚本精确断言 `0.2.2-rc.3`，模式通过显式 executor row 配置。测试新版本前显式更新预期版本并核对接口，不能只换目录或删除版本检查。准备 profile 时也必须显式传 DSH_HOME。
- [Desktop 测试入口](../plugin/package.json) `test:desktop` 消费 `OWNDSH_TEST_RUNTIME`，要求符合脚本预期的桌面启动器布局；它不等于任意 npm dsh 的测试入口。
- [T11 模型脚本](../plugin/scripts/t11-harness-model-smoke.mjs)、[T14 CLI 脚本](../plugin/scripts/t14-dsh-plugin-smoke.mjs)、[T15 浏览器脚本](../plugin/scripts/t15-browser-harness.mjs)仍绑定历史源码锁；T11 的版本断言已改为跟随锁文件，仍不能把旧 checkout 结果当作当前目标版本证据。它们可复用场景，迁到目标发行 runtime 并核对版本后才算本轮证据。不要为让旧脚本通过而更改无关的历史锁。
- 同版本 tgz 重装可能命中 pnpm 缓存；使用新的临时制品路径，并核对安装内容。发布 CI 会注入版本，报告须区分发布前构建包与正式制品；若只检查正式制品的完整性，不写成“正式包已跑浏览器 E2E”。

### 3.3 留下可审查结论

每次升级单独保存一份验收报告，更新本文第 1 节及变化的契约。最小记录格式：

```text
日期 / 插件 commit、tgz 版本与哈希：
目标 Harness / MCP SDK 实际版本 / 运行面：
上游变化及受影响编号：Dxx；未受影响的依据：
契约变化 / 本地适配或删除：
执行入口、环境与证据位置：
逐项结果：通过 / 失败 / 未验证（原因）
结论适用范围、已知差异与发布限制：
```

“通过”只覆盖记录中的环境和场景。类型/模块检查通过、目标 Host E2E 通过、真实供应商通过是不同证据，不能互相替代。关键契约失败时先修复或明确收窄支持范围；未验证项保持未验证，不从旧版本报告推导通过。

## 4. 临时接缝与维护规则

### 4.1 官方能力到位后删除什么

| 当前接缝 | 为什么仍存在 | 删除条件与动作 |
|---|---|---|
| `connectOAuth` 中的 SDK Client/transport 组合及工具、资源、instructions 注册 | 当前 dsh-mcp-client 的接入尚未承接 OwnDsh 所需的 OAuth provider。协议始终由官方 SDK 执行，但连接到 Harness 的组合由 OwnDsh 完成。 | 官方 client 提供所需 OAuth provider 接入口且 D08–D13 验收通过后，改用官方 client，删除这段连接与注册组合，避免同时维护两条 OAuth 连接路径。 |
| `McpOAuthProvider`、短期授权状态、浏览器/loopback 桥及 SDK 凭据适配 | SDK 需要宿主提供记录和用户授权交接；现有 Harness client 尚未完整接管。 | 官方完整承接这些宿主职责，并能保持企业 owner/target 隔离、取消、回调校验及重启恢复后删除对应接缝。只新增一个 authProvider 参数不足以删除仍被 SDK 要求的宿主实现。 |

MCP 搜索/释放和企业凭据隔离属于产品策略；插件发现、安装和生命周期统一交给官方 plugin-market/pluginManager，OwnDsh 只提供标准索引和服务端公开投影，不维护第二套插件目录状态机。官方提供等价能力时，先按矩阵证明策略保持，再收敛实现。

当前已知差异：SDK 会在 401 后刷新并重试；invalid_grant 后未完成授权的在途调用可能先超时，随后页面提示重新授权。详细证据见 [0.1.7-rc.1 报告](dsh-017-rc1-compatibility-20260924.md)。

### 4.2 何时更新本文

- 新增/删除上游 import、服务、slot、hook、row ID、CLI 参数、目录布局假设或行为接缝时，在同一改动中更新相应矩阵项、L3 与模块 CLAUDE.md。
- 改测试或新增验收证据时更新验证入口和覆盖边界；接口已核对不等于场景已通过。
- 版本升级后更新第 1 节，保留历史报告的原始版本与结果；发生失败时记录差异及对应编号，不把本文写成完整更新日志。
- 包版本以 manifest/lockfile 为真源，接入行为以代码为真源，兼容结论以目标运行时的证据为真源。初期只维护本 Markdown 和现有测试，不另建版本数据库或自动兼容判定系统。
