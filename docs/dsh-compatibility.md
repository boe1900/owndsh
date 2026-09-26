<!--
[INPUT]: 当前插件对 Harness/官方 MCP SDK 的实际接入、npm manifests/lockfile、构建脚本与已执行的验收证据。
[OUTPUT]: 提供依赖契约、上游变化到本地影响的映射、升级检查入口和临时接缝删除条件。
[POS]: DSH 升级的检查入口；代码地图负责定位，历史报告保存证据，本表只描述当前接入与已验证范围。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 依赖契约与升级检查表

升级 Harness 或官方 MCP SDK 时先读本文。Release notes 用于定位变化，目标版本的公开导出、实现和真实运行结果用于确认影响。接口名称未变、类型检查通过或 peer 范围允许安装，都不能单独证明行为兼容。

只维护当前接入，不为未上线的 MCP 保留旧开发版凭据兼容分支。历史升级报告保留当时的事实，不自动成为新版本的支持承诺。

## 1. 当前基线与证据

最后核对：2026-09-24。接入代码以 beta.12 发布提交为基线，本轮 RC1 适配与验收见 [RC1 报告](dsh-017-rc1-compatibility-20260924.md)。

| 项目 | 当前事实与真源 |
|---|---|
| 插件发布 | [v0.1.0-beta.12](https://github.com/boe1900/owndsh/releases/tag/v0.1.0-beta.12)。[发布流水线](../.github/workflows/release.yml)从 Git tag 注入发布版本；本轮工作树 manifest 与本地 tgz 同步为 `0.1.0-beta.12`。 |
| Harness / MCP SDK | 开发依赖为 Harness `0.1.7-rc.1`、Cordis `4.0.4`、Schemastery `3.18.4` 与 `@modelcontextprotocol/client` `2.0.0`。完整直接依赖与 peer 范围见 [bundle manifest](../plugin/packages/bundle/package.json)及其它 workspace manifest；实际解析图见 [pnpm-lock.yaml](../plugin/pnpm-lock.yaml)。不在本文复制全量版本清单。 |
| 完整插件检查 | RC1 隔离运行树通过依赖安装、类型检查、构建、136 条模块测试和 workspace 检查；本轮必要适配见 [RC1 报告](dsh-017-rc1-compatibility-20260924.md)。 |
| 当前 Web 行为证据 | [0.1.7-rc.1 报告](dsh-017-rc1-compatibility-20260924.md)：10 组场景，真实浏览器、Host、AgentLoop 和官方 adapter；平台、模型、MCP/OAuth 为本地协议桩。 |
| 当前模块验证 | RC1 隔离运行树的 15 个测试文件、136 条 Vitest、TypeScript 检查和 Bundle 构建通过；Desktop 脚本需要外部 `OWNDSH_TEST_RUNTIME`，本轮未把 Desktop 原生外壳作为 RC1 证据。 |
| 已覆盖范围 | Web 登录/重启恢复、插件页面入口、MCP 三种认证、工具分页、协议协商、无工具服务器、资源与 URI 模板、按需加载/释放/Agent 隔离、OAuth 刷新与重新授权。 |
| 本基线未覆盖 | 真实供应商 OAuth、手工 endpoint/动态注册、远端回调、真实 PTC 解释器、`0.1.7-rc.1` Desktop 原生外壳、智能体团队，以及企业插件安装/卸载的真实包管理链路。PTC/both × TS/Python 的模块回归使用受控 bindings，不能代替解释器 E2E。 |

`upstream/` 中的 [Desktop 锁](../upstream/dsh-desktop.lock.json)与 [Harness 锁](../upstream/deepseek-harness.lock.json)仍描述早期 Desktop `2.0.3` / Harness `0.1.1-rc.2` 源码夹具，参见[历史迁移记录](desktop-2.0.3-harness-rc2-migration.md)。它们不是当前 npm/Web 验证基线，也不证明当前插件兼容该旧版本。独立 OwnDsh Desktop 的发行运行时由桌面仓库管理，升级时必须记录其实际内置 Harness 版本。

## 2. 依赖矩阵

按上游变化匹配下面的编号，再定位代码和验证。公开 API 的签名检查与运行行为检查都要保留；字符串 ID、本地窄 port、`ctx.get()` 类型断言和 hook 顺序尤其容易绕过编译检查。

### 2.1 启动与 Host 服务

| 编号 / 上游依赖 | 当前依赖的契约 | 本地位置与验证入口 | 变化影响与升级检查 |
|---|---|---|---|
| D01 插件 manifest / Client loader / 包导出 | `dsh.bundle.patch`、`dsh.client.platform: web` 及 Client inject；浏览器通过 `window.__ModuleLoader__.load()` 装载 lazy-CJS factory。官方 Host 服务、React 和 UI primitives 使用宿主共享实例。 | [manifest](../plugin/packages/bundle/package.json)、[build.mjs](../plugin/packages/bundle/scripts/build.mjs)；[bundle 回归](../plugin/packages/bundle/tests/bundle.spec.ts)、目标 Host 启动。 | 导出路径、扫描方式、模块格式或服务身份变化会让插件不加载或产生重复实例。核对 exports、peers、external 和 Client 注入项，并用实际 tgz 安装。 |
| D02 base/web profile 与 row ID | 覆盖 `agent-default-model`；停用 `llm-deepseek`、`llm-pi-ai`、`ui-settings-models`、`ui-plugin-manager`；插入 `owndsh`。`mcp-resources` 由 0.1.7-rc.1 base 提供，不重复插入。 | [cordis.patch.yml](../plugin/packages/bundle/cordis.patch.yml)；bundle 回归、[Web E2E](../plugin/scripts/web-mcp.test.mjs)。 | 上游新增默认插件、改 row ID 或 layer 合并规则时，逐项检查目标 profile。alpha.2 曾因重复 resources row 无法启动。禁用管理页只收口页面入口，Host/CLI 仍保留；智能体团队另验入口和功能。 |
| D03 Cordis / Schemastery / fiber | `inject`、`ctx.plugin/isolate/effect/on`、fiber 等待/更新/释放和 schema 默认值；异步释放必须撤回工具、路由及旧身份连接。 | [Host 组合入口](../plugin/packages/bundle/src/index.ts)、[模型注册](../plugin/packages/llm-gateway/src/registration.ts)、[MCP runtime](../plugin/packages/bundle/src/mcp-runtime.ts)；完整检查、MCP/平台生命周期回归。 | 生命周期函数或更新语义变化可能留下旧能力或重复挂载。验证更新、登出、取消和 dispose；同一个服务不能解析成两份运行实例。 |
| D04 credentials provider | `credentialKey`、`readRecord/modifyRecord/deleteRecord` 与 GrantRecord；依赖 provider 原子修改语义。企业登录 Grant 和 MCP owner/target 记录分开，迟到写入受生命周期约束。 | [平台凭据](../plugin/packages/platform-client/src/platform-credentials.ts)、[MCP 凭据](../plugin/packages/bundle/src/mcp-oauth.ts)；[平台回归](../plugin/packages/platform-client/tests/platform-service.spec.ts)、[OAuth 回归](../plugin/packages/bundle/tests/mcp-oauth.spec.ts)、Web 重启恢复。 | 记录格式、原子性或持久化边界变化需验证刷新轮换、账号/目标隔离、撤销与重启恢复。不得把平台 Token 交给 MCP 或浏览器。 |
| D05 settings | 通过官方 `SettingsForms.configure({ auto: false })` 与 `update()` 写入 bundle Config 的 `baseUrl`、`mcp.desiredConnected`；volatile 更新由 `loader/volatile-update` 接收，账号状态仍由 OwnDsh Service 约束。 | [平台服务](../plugin/packages/platform-client/src/platform-service.ts)、[MCP runtime](../plugin/packages/bundle/src/mcp-runtime.ts)；平台回归、目标 Host 修改地址和重启。 | `SettingsForms` schema、volatile 标记或事件路径变化会造成配置丢失、连接意愿不生效或旧账号复活。核对保存失败、授权中修改、退出后修改及重启恢复。 |
| D06 webServer 与同源通道 | `webServer.register({kind, path, handler})` 返回注销函数；浏览器通过宿主同源通道访问 `/enterprise/api/v1/local`，返回脱敏 DTO。 | [Host 路由](../plugin/packages/platform-client/src/local-api.ts)、[浏览器 API](../plugin/packages/ui/src/local-api.ts)、MCP runtime；两侧 local-api 回归、Web 登录/MCP 操作。 | 路由挂载、路径前缀、鉴权或 origin 策略变化可能使所有 UI 动作失效。检查请求确实经过目标宿主的访问保护，插件释放后路由移除；原生 Node HTTP 路由测试不证明宿主保护仍生效。 |

### 2.2 模型、MCP 与按需加载

| 编号 / 上游依赖 | 当前依赖的契约 | 本地位置与验证入口 | 变化影响与升级检查 |
|---|---|---|---|
| D07 dsh-llm / dsh-llm-pi-ai | `APP_IDENTITY.version` 上报真实 Harness 版本；官方 provider profiles 承载三协议、headers、baseURL、reasoning、compat 和 default；隔离 settings 后动态更新 fiber，重试与消息协议归官方。 | [profiles](../plugin/packages/llm-gateway/src/profiles.ts)、[registration](../plugin/packages/llm-gateway/src/registration.ts)、[proxy](../plugin/packages/llm-gateway/src/proxy.ts)；[profiles 回归](../plugin/packages/llm-gateway/tests/profiles.spec.ts)、[proxy 回归](../plugin/packages/llm-gateway/tests/proxy.spec.ts)。 | profile 字段、URL 拼接、流错误、重试分类或调用快照变化需检查三协议请求与取消、动态模型、default、Retry-After、瞬时 429 与终态 quota。当前 MCP Web E2E 只使用 Chat Completions 桩，不覆盖完整模型矩阵。 |
| D08 dsh-mcp-client | none/API Key 走官方 `apply` + 独立 fiber，使用 `Config/ReconnectConfig`、启动失败、发现与注册语义；API Key 原样放入指定 Header。 | MCP runtime 的 `reconcile`；[MCP 回归](../plugin/packages/bundle/tests/mcp-runtime.spec.ts)、Web E2E。 | transport/config/reconnect 或命名规则变化需验证发现、分页、重连、禁用/启用、定义更新和撤销；tools capability 缺失时不能强行请求 tools/list。 |
| D09 官方 MCP SDK v2 OAuth 连接 | OAuth 目前直接使用 `Client`、`StreamableHTTPClientTransport`、`auth()`；SDK 负责协商、分页、协议 OAuth 和重试，工具定义复用官方 `createMcpToolDefinition`。OwnDsh 组合工具列表变化、超时/取消及释放。 | MCP runtime 的 `connectOAuth`；MCP 回归、Web OAuth/分页/协商场景。 | SDK 更新必须同时看 transport/auth/listTools/callTool 行为、tools/list_changed 与任务支持。不能把 none/API Key 通过推定成 OAuth 通过，也不能把 SDK 2.x 的变化漏掉。 |
| D10 dsh-mcp-resources / systemPrompt 章节 | OAuth 连接通过 `mcpResources.register(server, provider)` 转交 list/templates/read；通过 `systemPrompt.section()`、`MCP_SERVERS` 顺序挂载服务器 instructions，关闭时注销。非 OAuth 路径由官方 client 管理。 | `connectOAuth`；MCP 回归、Web 资源和无工具服务器场景。 | provider 请求形状、cursor、URI、instructions 或章节生命周期变化需检查两种连接路径。资源共享工具与按需加载的业务工具是不同入口，业务工具隐藏不能代替资源验收。 |
| D11 OAuthClientProvider / loopback | `StoredOAuthTokens/StoredOAuthClientInformation`、issuer 上下文、失效 scopes、verifier 与 discovery state；回调 state 在 loopback 校验，`iss` 交给 SDK，discovery state 供 SDK 绑定授权服务器。 | [mcp-oauth.ts](../plugin/packages/bundle/src/mcp-oauth.ts)、[pkce.ts](../plugin/packages/platform-client/src/pkce.ts)；OAuth 回归、Web 刷新/重授权/重启。 | provider 新增可选方法也可能改变安全行为，必须读 SDK 警告。覆盖 401 刷新、invalid_grant、取消、账号切换、迟到写入和 callback 绑定；SDK 可以重试 401，不能沿用旧版“不重放”假设。 |
| D12 dsh-tools / Agent scope / 执行 hooks | `schemas/get/register/guard`、`tools/change`、`tools/pre-execute`、`tools/execute`；依赖同一执行上下文串联 hook、guard 与调用，按 Agent 保存加载集合及本步呈现快照。 | [mcp-tools.ts](../plugin/packages/bundle/src/mcp-tools.ts)；MCP 回归和 Web 按需加载场景。 | **重点检查行为**：冷启动无受管 schema，search 下一步加载并累加去重，release 下一步撤回但本步已呈现调用仍可执行；实时撤权/定义替换优先，新 Agent 不继承集合。Hook 顺序、作用域或对象身份变化可能让编译通过而门禁失效。 |
| D13 system-prompt / PTC SDK 渲染 | `system-prompt/assemble` 的 output.tools/sections、`tools:sdk`、`renderToolsSdk/renderToolsSdkPy`、`ptcRuntime.language` 与 `run_code`；native schema 与 PTC 文本必须呈现同一集合。 | mcp-tools 的 assemble hook；MCP 回归中的 native/ptc/both × TS/Python。 | **重点检查行为**：章节名称、渲染格式、插值阶段、PTC bindings 或 Agent 上下文变化需重新核对。本轮接入已将 `codeRuntime` 读取改为 `ptcRuntime` 并调整章节文本处理。修改这些边界后要补目标版本真实解释器验证，现有受控 bindings 回归不足以证明解释器兼容。 |

### 2.3 页面、安装与桌面宿主

| 编号 / 上游依赖 | 当前依赖的契约 | 本地位置与验证入口 | 变化影响与升级检查 |
|---|---|---|---|
| D14 Client slots / remote / ui-primitives | 注册官方 `main`、`sidebar.panellist`、`settings.section`、`shell.overlay`；监听 `plugin-manager/changed`、安装日志/状态及既有账号事件；复用官方页面组件、主题和配置槽位。 | [client.tsx](../plugin/packages/ui/src/client.tsx)、[plugin-manager](../plugin/packages/ui/src/plugin-manager/)、[account-view](../plugin/packages/ui/src/account-view.tsx)；[Client 回归](../plugin/packages/ui/tests/client.spec.ts)、UI 模块回归、目标浏览器。 | slot/事件名、Remote 或 Modal 行为变化可能使插件页、门禁、认证失效刷新或配置页失效。检查官方页导航、企业页签、安装进度、启停/卸载、配置槽位、登录前后和断线恢复。 |
| D15 官方 pluginManager / inventory / profile 布局 | 官方同步页读取 `pluginInventory.list()`、`pluginManager.listBundles()`/`listPlugins()`；企业目录只投影服务端元数据，固定 spec 通过 `pluginManager.installBundle()` 安装或更新，启停/卸载直接调用官方 Remote，不维护第二套安装状态或 CLI。 | [manager-store.ts](../plugin/packages/ui/src/plugin-manager/manager-store.ts)、[EnterprisePluginDirectory.tsx](../plugin/packages/ui/src/plugin-manager/EnterprisePluginDirectory.tsx)、[local-api.ts](../plugin/packages/platform-client/src/local-api.ts)；UI/platform-client/bundle 回归、目标版本真实页面。 | `ChangeResult.application`、包版本事实、inventory 管理能力或官方配置槽位变化会造成假成功、误报更新或安装后状态丢失。企业页面只在更高 semver 时显示更新，非法 spec 在进入官方 Remote 前拒绝。 |
| D16 官方重启与安装进度 | `restart-required`、安装日志/状态、取消和结果恢复全部显示在官方同步页；Desktop 有公开重启动作时复用官方交互，普通 Web 保留官方待重启状态。 | [InstallDialog.tsx](../plugin/packages/ui/src/plugin-manager/InstallDialog.tsx)、[bundle](../plugin/packages/bundle/src/index.ts)；UI/bundle 回归和显式 `OWNDSH_TEST_RUNTIME` 的目标 Desktop。 | Remote 返回时序、安装事件或重启语义变化会使操作完成但页面误报。Web 与 Desktop 需分别验证，不能用旧 Harness 运行树代替 RC1 证据。 |

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
| D02、D14–D16 | 官方入口关闭、自有入口保留；安装/更新/卸载、实际 profile、库存、重启生效。涉及团队插件则单独验证团队启用与页面入口。 |
| D16 或桌面发行升级 | 使用桌面实际分发 runtime，验证原生外壳与目标 OS；分别记录 Web 与 Desktop 结论。 |

已有入口的适用范围：

- Web/MCP 脚本读取 `OWNDSH_TEST_RUNTIME`（含目标 npm dsh 的目录）、`OWNDSH_TEST_PROFILE`（已装本次 tgz 的 web profile），可通过 `OWNDSH_PLAYWRIGHT_MODULE`、`OWNDSH_CHROMIUM_PATH` 指定浏览器依赖，通过 `OWNDSH_E2E_OUTPUT` 隔离证据。它复制 profile，并比对安装包 Host bundle 与当前构建产物的哈希；当前脚本精确断言 `0.1.7-rc.1`。测试新版本前显式更新预期版本并核对接口，不能只换目录或删除版本检查。准备 profile 时也必须显式传 DSH_HOME。
- [Desktop 测试入口](../plugin/package.json) `test:desktop` 消费 `OWNDSH_TEST_RUNTIME`，要求符合脚本预期的桌面启动器布局；它不等于任意 npm dsh 的测试入口。
- [T11 模型脚本](../plugin/scripts/t11-harness-model-smoke.mjs)、[T14 CLI 脚本](../plugin/scripts/t14-dsh-plugin-smoke.mjs)、[T15 浏览器脚本](../plugin/scripts/t15-browser-harness.mjs)仍绑定历史源码锁；T11 的版本断言已改为跟随锁文件，仍不能把旧 checkout 结果当作 RC1 证据。它们可复用场景，迁到目标发行 runtime 并核对版本后才算本轮证据。不要为让旧脚本通过而更改无关的历史锁。
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

MCP 搜索/释放和企业凭据隔离属于产品策略，禁用通用插件管理页属于入口策略；它们不因官方发布新版本而自动删除。官方提供等价能力时，先按矩阵证明策略保持，再收敛实现。

当前已知差异：SDK 会在 401 后刷新并重试；invalid_grant 后未完成授权的在途调用可能先超时，随后页面提示重新授权。详细证据见 [0.1.7-rc.1 报告](dsh-017-rc1-compatibility-20260924.md)。

### 4.2 何时更新本文

- 新增/删除上游 import、服务、slot、hook、row ID、CLI 参数、目录布局假设或行为接缝时，在同一改动中更新相应矩阵项、L3 与模块 CLAUDE.md。
- 改测试或新增验收证据时更新验证入口和覆盖边界；接口已核对不等于场景已通过。
- 版本升级后更新第 1 节，保留历史报告的原始版本与结果；发生失败时记录差异及对应编号，不把本文写成完整更新日志。
- 包版本以 manifest/lockfile 为真源，接入行为以代码为真源，兼容结论以目标运行时的证据为真源。初期只维护本 Markdown 和现有测试，不另建版本数据库或自动兼容判定系统。
