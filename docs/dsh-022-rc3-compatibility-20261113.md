<!--
[INPUT]: 官方 rc.5/rc.3 精确源码、目标 npm 制品、当前 manifests/lockfiles、真实模型与隔离 Web/Desktop 制品验收。
[OUTPUT]: 记录 D01–D17 兼容判断、必要迁移、保留接缝，以及本机、桌面和 NAS 补验的实际边界。
[POS]: 本次 DSH 升级的审查记录；当前依赖入口为 dsh-compatibility.md，真实 Host/双机验收独立补证。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 0.2.2-rc.3 兼容迁移记录

2026-11-13。目标为官方 `dsh-v0.2.2-rc.3`，commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`；对照 `dsh-v0.2.1-rc.5`，commit `b830ec950faba0a46dda564be3e2d854afed94f1`。OwnDsh 工作区从 `9bbf8c56e` 开始，插件版本仍为 `0.1.0-beta.20`。升级补验阶段未提交、未发布 npm，也未替换现有部署；用户随后授权发布 beta.21 插件、rc.3 Desktop 并实测自动更新，状态见文末发布记录。桌面发行适配与真实安装包的补验结果见下文。验证期间本机 Docker 虚拟机曾发生 OOM，影响及恢复记录见下文。

本轮交付同版本 rc.3 Host 与 rc.3 Console assembly。旧 rc.5 继续使用历史发行物；新 Controller 在业务请求前拒绝旧 Host 的 ready，不承诺任意版本混连。Remote wire 版本与 HTTP OpenAPI hash 均不变。

## 依赖与交付

DSH 开发依赖和发布 peers 精确锁定 `0.2.2-rc.3`，Cordis 开发版 `4.1.0` / peer `~4.1.0`，Schemastery 开发版 `3.19.0` / peer `~3.19.0`。loader/include 为 `1.1.0`，group 为 `1.0.5`。插件要求 Node.js ≥24.9.0，构建目标改为 node24。官方服务及执行器保留 external，避免把另一份 Cordis/DSH runtime 打入 Host bundle；未使用且 rc.3 不再发布的 `dsh-invariants` 开发依赖移除。

Console 因 jsdom 测试工具链要求 Node.js ≥24.15.0，构建镜像固定 `node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d`；Dockerfile 与离线构建的本地 RepoDigest fallback 同步，生产 Nginx 仍用 Alpine。Ego 0.9.14 在构建 Host 初始化时会触发官方 subprocess capability probe，继而加载 Koffi 3.1.1；实测 Alpine arm64 上 glibc addon 加载 SIGSEGV，未能回退 musl。官方默认 rc.3 Web profile 在同镜像可启动，不能归因为 rc.3 CLI 普遍故障。Debian glibc 下同一依赖加载及真实 getpid FFI 通过，不修改第三方 loader，也不禁用 Ego。插件/Host 的 ≥24.9.0 要求保持独立。

Console 的独立 native-runtime 同步锁定 rc.3，Ego 维持 `0.9.14`。历史 `upstream/` 源码锁仍是原始夹具，未为本轮 npm 升级修改。`workspaceConcurrency: 1` 保留，构建、测试和 pack 顺序执行。

plugin 锁中的 Cordis 只有 `4.1.0`，Schemastery 只有 `3.19.0`。Console native-runtime 中，Ego `0.9.14` 自己固定 `Schemastery 3.18.5`，与 DSH 的 `3.19.0` 并存；没有覆写第三方依赖。两版上游源码差异仅为版本号，该事实仍不能替代 Ego 在 rc.3 的真实激活验证。

## 上游更新对现有设计的影响

rc.3 自身新增实验性 DeepSeek 会话导入，并修复 Windows 桌面自更新；本次插件不接管这两项业务。累计 rc.1/rc.2 的变动更大，不能只修改版本号。

- 工具执行拆为 Agent scope 的 native/PTC executor，新增每步 when/admission 和 VM script 格式。旧 `tools.mode`、从 prompt 改写工具声明及旧 renderer 导出已经过时，本次改用官方 executor/toolSet 并按实际 programFormat 渲染。
- 官方 MCP manager 已有非 OAuth 连接管理，但没有企业 owner/target、授权租约及 SDK OAuth 能力。本次禁用其默认 row，保留企业入口和官方 MCP client/resources，不建立第二套 MCP 协议。
- 文件侧栏新增会话 scope 搜索，媒体引入版本参数与重定向，Web 静态资源新增 package assets。管控台冻结页面、资源采集和 Host 封闭路由一并更新。
- 新版 PiAi 修正工具历史、Anthropic thinking replay 和网关错误分类，并上调缺省模型容量。企业层继续只做网关授权、配额与密钥注入，不复制这些模型协议逻辑。
- 官方 `webServer.readResource` 可以简化后续静态读取，但不能代替当前远端 owner admission、业务 POST/mux 和加密连接。本次不为追新接口重写已稳定边界。

发布说明见 [rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3)、[rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2) 和 [rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1)。D01–D17 表记录对应源码核对。

## D01–D17 对照

| 编号 | 上游事实与本地处理 |
|---|---|
| D01 manifest / loader / 导出 | DSH 包及 peers、锁文件、build target 和 PTC renderer external 一起升级。插件 bundle/client 入口形状保留；Console 新增正式 package assets 导出的冻结采集。 |
| D02 profile | 原模型/账号 row ID 仍存在，企业覆盖保留。新增默认 `mcp-manager` 可建立未受管连接，显式停用该 row；官方 `mcp-resources` 和 Discover 保留。团队、OfficeKit、DeepSeekSearch 不作为本次企业已验收功能。 |
| D03 Cordis / schema | Cordis 的 raw/effective fiber 配置和 internal 通知变化不要求产品兼容层，当前代码不读取这些 internals。官方 client 注册通过 child tools facade 委托，保留 child tracing 和 disposer。 |
| D04 credentials | record/modify/delete 原子接口保留，新增 masked preview 不影响当前用法。企业登录与 MCP owner/target 凭据隔离保持；未引入凭据格式迁移。 |
| D05 settings | configure/update 与 volatile paths 仍可用；官方改为按 owner 读取有效配置。现有 Server、连接意愿和账号生命周期继续复用同一接口。 |
| D06 webServer | `register` 仍可用。新 `readResource` 只支持资源 GET/HEAD，不负责 owner admission，也不能承接业务 POST/mux；本次保留静态装配的既有 HTTP 接缝。 |
| D07 模型 | 官方 PiAi 继续拥有三协议、重试、消息和流语义。同步 request-headers hook 无法等待企业按需续期，也不能替代透明代理。bootstrap 显式 contextWindow/maxTokens 照传；缺省继承新官方 1,000,000/128,000，旧 fallback 为 262,144/32,768。 |
| D08 官方 MCP client | 新 closeTimeoutMs/expandTemplates 默认值通过官方 `Config(raw)` 正规化，不手写第二份 schema。none/API Key 保留每服务器独立 fiber，注册进入统一 admission。 |
| D09 OAuth 连接 | rc.3 client transport 仍无 authProvider 参数，manager 也未实现 OAuth。保留官方 SDK v2 Client/transport/auth 组合，协议 OAuth 继续由 SDK 负责。 |
| D10 MCP resources / instructions | provider 注册与 prompt section 接口无破坏；OAuth 继续委托官方 mcp-resources，非 OAuth 由官方 client 管理。 |
| D11 OAuth provider / callback | owner/target、issuer、state/verifier、loopback、取消和持久化仍是 Host 适配职责。Web 夹具只放行精确 GET `/authorized` 成功页，其余平台 API 仍强制 Bearer。 |
| D12 registry / executor | 旧 mode 配置移除，测试显式装配 native/PTC executors，执行改为 batch。产品使用 canonical register 的 when 与官方本步 toolSet，不从 presentation 改写 tools。 |
| D13 prompt / SDK | renderer 移到 PTC executor 包。模式按每次 resolve 的官方空集 assembly 探测，SDK 与 TS function-body/repl/script 或 Python 官方输出逐项匹配后重绘；scope、conditional tool 和 toolSet 同步保留。 |
| D14 slots / Menu | settings.section、settings.launcher、shell.overlay 与当前 Menu 调用形状保留；企业账号入口仍有职责。官方新增 DeepSeek 通知 slot 不是企业账号抽象，不据此替换 OwnDsh 登录。 |
| D15 Discover / index | format-1、listIndexes/setIndexes 与 npm target 保留；README/详情及平台兼容判断由官方增强，继续承接官方页面与安装事实，不恢复第二套目录。 |
| D16 安装 / 重启 | ChangeResult application 与 desktopActions.requestRestart 仍可用。安装日志、取消、失败和重启由官方 Discover 持有；本次未替换安装状态机。 |
| D17 Console / Remote / Ego | rc.3 UI 与 Host API 配对；补 package assets resolver、会话文件搜索 scope、interruptByUser 和版本媒体 URL。Ego 维持三方精确版本/启用门禁与 CDP 限定，真实双 Host 与新 Console 结果见下文。 |

官方源码定位：`packages/core/tools`、`tool-executor-native`、`tool-executor-ptc`、`system-prompt`，`packages/mcp/mcp-client`、`mcp-manager`，`packages/llm/llm-pi-ai`，以及 `packages/client`、`api/workspace-files`、`api/session-controller`。以目标 commit 的公开导出和实现为判断依据，不把 main 分支文档套用到 rc.3。

## MCP admission 与呈现

每个 MCP definition 只注册到官方 canonical registry。官方非 OAuth client 看到的 facade 仅拦截 register，再把 definition、when 和注销交给该 child 的真实 tools；OAuth 定义使用相同入口。原有独立 fiber、授权租约与连接撤销保留。

同一次 `resolve()` 的 `ToolActivationContext` 共用一个模式 Promise，不跨 resolve 缓存。探测调用 `systemPrompt.assemble({ scope: activation.agent, toolSet: EMPTY_PROBE_SET, modelSelection, signal })`，不传 agent，防止 `workingDirectory.ensure` 初始化会话。空集结果仅允许 native 的空工具或 PTC 的单 `run_code`。OwnDsh hook 遇探测直接 next，不刷新授权，不改变选择、SDK 或呈现快照。

Host 组合入口必须显式声明 `systemPrompt` 注入。首轮真实 Edge native/PTC 在登录和 MCP 连接成功后，首条 prompt 都因 `cannot get property "systemPrompt" without inject` 失败，尚未发出模型请求；根 Context 单元测试未模拟该 Cordis 访问限制。本轮已补入口 inject，并校验源码与构建包的声明一致，修复后的最终包已通过真实 Edge native、PTC 各 9 项业务验收及各 3 项 structured 专项。首轮截图位于主仓库 `.tmp/dsh-022-rc3/target-native/failure.png`。

native 的 when 只准入 direct 与已选 deferred，codemode/hidden 不准入。PTC 准入全部非 hidden 定义，保留既有搜索前按名调用 binding 的策略；SDK 可发现性仍只展示 direct 和已选工具。`tool_search` 自身也使用同一 when 模式探测，空目录不依赖任一 MCP definition 才能确定模式。

when 只检查静态 definition、scope 和曝光选择，不使用授权 fresh/expiry。官方 resolve 早于正式 assembly；若在 resolve 先按过期租约移除工具，随后刷新成功也无法补回本步，并会清空 deferred 选择。本轮通过 native direct、已选 deferred、PTC 的三条闲置恢复回归固定该顺序；授权刷新仍由正式 assembly 和执行前守卫负责，持续失效不会执行 MCP。

搜索候选来自 Agent scope 的 registry view，不传当前执行的 toolSet，否则尚未加载的 deferred 定义永远不可发现。正式 assembly/SDK/执行都带本步 toolSet。SDK 重绘只触及 `tools:sdk` 文本，按真实官方 renderer 识别格式，拒绝未知输出；conditional 官方工具不会被重新加入。搜索和释放只影响下一步，定义更换、连接撤销或授权失效仍实时拒绝。

执行 guard 先用实时 registry/scope、租约和连接代次判断失效，再单独查询本步 toolSet。定义有效但本步未准入返回 `MCP_TOOL_NOT_LOADED`，定义替换返回 `MCP_GENERATION_CHANGED`，授权过期或失效先返回 `MCP_POLICY_STALE` 或 `MCP_AUTH_REQUIRED`。PTC 与 native 的成功路径都要求官方本步准入，搜索不会授权当前步执行。

官方 admission 已接管本步准入，但现有 nativePresented、run_code token 关联和执行 guard 仍保留。它们承载四档曝光、Agent 隔离和实时撤权；本次未为减少行数而改变既有策略。

## Remote 与固定 Console assembly

`remote-core` 导出唯一 `DSH_CARRIER_VERSION = '0.2.2-rc.3'`。Host 三包版本门禁和密文 ready 共用该值；ready schema 只解析有界字符串，Controller 再做严格版本比较，旧 rc.5 返回 `ENT_REMOTE_DSH_VERSION`，Console 明确提示设备升级。该值是 DSH 应用 ABI，不是 Remote wire 版本。

文件搜索使用独立 envelope schema，读取 `args.workspaceFileScopeId` 和 request；scope 必须来自当前 catalog 的 session-to-workspace 映射，且 workspace root 经 realpath 授权。子 Agent 用户中断只开放新 `subagents/interruptByUser`，删除旧 parent 端点。

`/api/file` 只接受 GET/HEAD 和唯一 path/v/load 参数。load 为正安全整数，v 有界且无控制字符。Host 内最多四次跟随官方 302，每跳必须同 origin、同 `/api/file`、同原 path，重新执行 realpath 授权；循环、跨 origin、换 path、非法参数和其他重定向拒绝。原生 owner cookie 与 Location 留在 Host。

Console 构建冻结 56 个模块、160 项资源。按官方 `./assets/* -> ./lib/assets/*` 导出采集 revisioned assets，以每路径 segment 编码映射 `/plugins/<pkg>/assets/...`；transport 提供 resolveAsset，未知资源继续拒绝。官方 HTML injections 与 shell 只执行本地发布的固定资源，目标 Host 不供应可执行插件代码。

| 官方资源 | rc.3 SHA-256 |
|---|---|
| shell `index-Ciz7DZxv.js` | `65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b` |
| conversation | `3d166eab312749bf8c528dd7d26d95340df75a27fec668b3510e4558fe9b343b` |
| preview | `f4c84ba525e3593c3f9ad1fc19f821fce3ff381320f9e27746fc441d12ce25fd` |

shell 的 boot、Markdown image、hover 接缝均重新核对目标 minified 源码，补丁要求恰好一次。附件 intake 在聚合和独立资源中分别裁剪，每个资源内要求唯一匹配；没有删除 hash 门禁来迁就新制品。

## 检查记录与适用范围

隔离工作区：`/Users/cola/.codex/worktrees/dsh-022-rc3/owndsh`。模块检查日志保存在该工作区 `.tmp/dsh-022-rc3/`；最终插件、容器及真实 Host 证据位于主仓库 `.tmp/dsh-022-rc3/`。临时 env.json 和测试身份仅供程序读取，不随报告公开。依赖安装显式使用 npmjs registry，避免默认镜像缺包；workspace 串行安装/构建。

| 检查 | 结果与日志 |
|---|---|
| plugin frozen install | 通过；`plugin-frozen-install-final.log`。 |
| plugin 完整 typecheck/build/tests/workspace | 通过，34 个 Vitest 文件 /234 项及 5 项 workspace 回归；主仓库 `plugin-final2.log`。 |
| bundle pack | 通过，制品内容与最终 lib 一致，25 项 DSH peers 精确 rc.3；主仓库 `pack-final2.log`。 |
| Console frozen native-runtime / build | 前轮通过，固定 56 modules /160 resources；`native-build.log`。 |
| Console 完整生产构建、类型与测试 | 最终 22 文件 /154 项通过；`console-check-final.log`。 |
| MCP 闲置租约回归 | 23 项通过，含 native direct/已选 deferred/PTC 同步恢复、持续失效拒执行及本步未准入错误分类；最终完整检查包含同一测试。 |
| MCP / secure link / Remote 定向 | 3 文件 /28 项通过；`targeted-check.log`，包括真实 Noise 旧 ready 拒绝及同版业务成功。 |
| Remote 原有行为 | 前轮 15 项通过；`remote-check.log`。边界扩展 5 项通过；`remote-boundary.log`。 |
| 发行链静态与元数据行为 | 15 项通过，实际执行 Harness 版本提取并验证错版/range 拒绝、Node 下限与 digest 一致；主仓库 `deployment-final2.log`。`sh -n deploy/scripts/build-release.sh` 通过。 |

插件制品：`artifacts/owndsh-plugin-0.1.0-beta.20.tgz`，最终 SHA-256 为 `671707368f9078336c8fb37f45afb5ea54ed10c78d8af9136a0d5e15b37d7dd6`。包内 Host bundle 与隔离验收构建的 lib 逐字节一致，真实 Host 验收均使用该制品。早期包已因真实注入失败和本步准入错误判定不可交付，不作为验收证据。本地制品不等于 npm 已发布。

本机模块检查执行时 Node 为 `24.13.0`，与 Console 声明下限分开记录。固定 Node `24.15.0` 的 Debian glibc arm64 Docker 构建已成功，包括 native-runtime 冻结安装、正式原生资源生成、Vite 与 TypeScript；同一 build stage 内 22 文件 /154 项测试通过。最终 Nginx 镜像实际启动后，`workspace.html` 和全部 160 项原生资源逐一 GET 与 SHA-256 检查通过。日志为主仓库 `docker-console-glibc-build4.log`、`docker-console-test.log`、`docker-static-result.json`。镜像提供 amd64/arm64 manifest，本轮只实际构建运行 arm64。

本机 Docker 虚拟机原为 2GB、无 swap，前两轮完整构建触发全局 OOM，Docker、SSH 隧道和 DNS 服务及已有容器进程受到影响。Docker 与带 restart policy 的容器自动恢复，DNS 显式恢复；随后为本轮验证添加临时 3GB swap 和任务专用 Docker socket 隧道，未修改持久资源配置。后续 pnpm code 23 经错误明细确认为网络超时，不是缺少 CA，不增加 CA 补丁。成功构建在恢复 DNS 后重新运行，未使用故障期间积压的构建。验收结束后已停止本轮 Java、静态 preview、PostgreSQL、Redis、Nginx 和独立 Ego 浏览器，移除临时 swap 与任务 SSH 隧道，并恢复 Colima 的两个原有 Docker socket 转发；默认 docker version 与现有容器运行状态已核对。复现与诊断分别保存在 `docker-diagnosis/` 和 `pnpm-diagnosis/`。

离线包的 `OWNDSH_HARNESS_VERSION` 现在由 bundle 精确 DSH peers 与 Console native-runtime 依赖交叉校验得出；历史源码锁内容不变，旧版本和 commit 仅写 `OWNDSH_HARNESS_SOURCE_FIXTURE_VERSION/COMMIT`。删除误导的 `OWNDSH_HARNESS_COMMIT`，未新增第二套 runtime commit 锁。

## 真实 rc.3 Host 与管控台

本节首轮模型请求使用明确的本机 OpenAI 协议 fixture，经真实 Java 网关处理。外部 Atria-Dawn 的补验另列，二者分别计证。

| 运行面 | 结果与主仓库 `.tmp/dsh-022-rc3/` 证据 |
|---|---|
| Edge / native MCP | 9 项通过，含登录、Discover、none/API Key/OAuth、真实 AgentLoop 搜索与下一步调用、资源、token rotation、invalid_grant 恢复、暂停重启、Agent 隔离、BM25 和 Host 重启恢复；`target3-native/result.json`。 |
| Edge / PTC MCP | 相同 9 项通过；`target3-ptc/result.json`。 |
| structured native / PTC | 各 3 项通过，含 outputSchema、结构化返回、A→B 值续传、unknown 与 isError；`target3-structured-native/result.json`、`target3-structured-ptc/result.json`。 |
| 两个隔离 rc.3 Host / 新 Console | 16 项通过，含企业登录、入站开关、Noise/lease、远端会话与流式对话、文件搜索与 v/load 媒体、大文件、路径与符号链接越权拒绝、终端、刷新 view、断线阻断、手动恢复和返回本机。新 Console 冷会话发送、远端搜索与 Markdown SVG Blob 解码通过，160 项资源逐一核对 hash；`remote-work3/run-1794564309376/result.json`，截图同目录 `rc3-console-native.png`。 |
| 可选 Ego 原生右栏 | 在正确隔离的浏览器配置下，完整 19 项联调通过。真实 AgentLoop 调用 ego_navigate、密文 SSE 首帧、原生右栏选页、图像解码与真实指针点击均通过，点击到达 Host 夹具 HTTP 服务；`remote-work3/run-1794564803727/result.json`、`ego-frame-result.json`，截图同目录 `rc3-console-native.png`。 |

Ego 最初画面列表为空属于验收环境错误。0.9.14 的 cast worker 读取 `EGO_LINUX_STATE_DIR`，vendored browser runtime 却只读取 XDG state/data 根；只设前者会让两者使用不同目录，并会复用默认 Ego 状态。最终夹具同时设置独立 `XDG_STATE_HOME`、`XDG_DATA_HOME`，将 worker 指向同一 state 子目录，并验证 browser.json 确实创建在那里。没有修改第三方运行包或新增产品补丁。

上述首轮 Host 位于同一台 Mac 的独立 DSH_HOME，服务端为隔离 Java/PostgreSQL/Redis。外部模型、桌面与 NAS 的补验状态见下一节。生产 TLS、LAN/P2P/TURN、多节点 fencing 和移动浏览器未复验。旧 rc.5 的历史双机结果不算 rc.3 验收。新增团队、OfficeKit、DeepSeekSearch 不属于本次验收范围；企业设备库存不恢复。

独立增量审阅确认 systemPrompt 注入、实时有效性与本步准入区分、glibc 镜像和离线 fallback 无运行逻辑阻断。审阅发现的报告 Alpine 镜像漂移已同步为实际 Debian glibc。L3、L2、L1 与改动逐项核对，修改的业务文件均未超过 800 行。

源代码和两份新增文档已整合回主仓库，逐文件比对与 diff 检查通过，HEAD 保持 `9bbf8c56e`。主仓库重新 frozen 安装与插件/Console 构建通过，插件模块及 workspace 回归再次通过。包内校验仍指向上述隔离验收制品；本轮未创建提交、push、npm 发布或替换 NAS 部署。

## 外部模型与发行补验

补验证据位于主仓库 `.tmp/dsh-022-rc3/supplement/`。本机使用当前 Java JAR、新 Console dist、标准 npm rc.3 和同一审阅插件 tgz，两个 Host 的 profile、目录和浏览器状态独立。本轮测试账户与密钥只写入被忽略的私有文件。

### 真实 Atria-Dawn

通过 `/models` 实际发现 `Atria-Dawn`，由用户提供的 `https://discovery-api.intern-ai.org.cn/v1` 经 OwnDsh Java 网关调用。模型密钥仅配置在服务端，不进入 Console。实际通过以下行为：

- Console 原生会话实际调用工具写入 `atria-proof.txt`，执行命令读取文件并运行 `uname -s`。回复和磁盘内容一致，实际输出为 `Darwin`，Controller 目录没有该文件。
- 多轮保留随机验证字符串，计算 `7319 + 27 = 7346`。
- 实际观察到模型部分输出后，经 Console 加密连接调用原生 `session/cancel`。Host 进入空闲，下一轮真实回复 `ATRIA_RECOVERED_7346`。
- 复用已登录 Host profile 重启，凭据静默恢复为 `READY`。

工具与多轮证据为 `local/run-1794574464957/atria-history.json`、`nas-atria-real-tools.png`。截图文件名沿用早期 NAS 夹具命名，实际拓扑是 Mac，不作为 NAS 成功证据。该轮最终停在测试观察器的换行匹配，不能把整轮 result 标为通过。原生 Markdown 将软换行折叠成空格，后续观察器按空白识别部分输出。最终流式停止和恢复结果为 `local/run-1794575124999/result.json`，同目录包含停止、恢复截图。

续测器最初尝试从封闭 carrier 读取仅供观测的 `session/state`，得到预期 `ENT_REMOTE_DENIED`。最终改从 Host 本地原生 API 观察状态，取消仍由真实 Console transport 发起。没有为测试扩大产品路由白名单。

`local/usage-evidence.json` 独立读取 PostgreSQL 账本。完成的外部请求为 `SETTLED`，包含非零真实 input/output/cache usage。三个被用户停止的流没有收到最终 usage，按既有 `CHARGED_MAX` 未知用量语义记录，实测 Token 保持零，没有编造用量。两条 10/5 的记录来自明确的协议 fixture，不属于外部模型。

rc.3 的默认压缩预留为 65,536 Token。旧测试配置 `contextWindow=32768` 加 `maxTokens=4096` 切换模型时报 `MODEL_SWITCH_COMPACTION_FAILED`，压缩没有可用预算。最终使用 `/models` 返回的真实 `contextWindow=524288`，没有修改第三方压缩逻辑。产品接入向导默认窗口为 256,000。升级已有小窗口模型时，管理员需核对实际窗口和官方压缩预留，不能将窗口虚报为大模型容量。

### macOS ARM64 真实安装包

桌面仓库 `/Users/cola/Projects/owndsh-desktop` 的独立 worktree 已升级官方 rc.3 commit，并生成 unsigned DMG 与 ZIP。DMG 只读挂载后，通过 `ditto` 复制到独立安装目录，实际运行安装后的 Electron App，没有用源码 dev 进程替代。

`desktop/package-result.json` 验证包内 `@deepseek-ai/dsh`、`dsh-desktop-host` 和 `dsh-web-frontend` 均为 `0.2.2-rc.3`。Electron 为 `44.7.0`，内嵌 Node 实测 `24.21.0`。安装包中的插件保留文件与同一审阅 tgz 逐字节一致，package manifest 的差异按官方 builder transformer 精确核对。`codesign --deep --strict` 通过，designated requirement 为 `identifier "com.owndsh.desktop"`。unsigned 未经 Apple 公证，不等于签名正式发行。

`desktop/model-result.json` 六项通过，包含真实平台地址保存、独立员工授权、系统浏览器 PKCE 登录、实际原生 AgentLoop 调用 Atria-Dawn、退出回到门禁与重新登录。真实回复唯一 marker，界面完成态和本地会话记录一致；未以协议 fixture 替代。重启同一安装 App 和 profile 后，企业凭据自动恢复 `READY`，无需再次浏览器登录，原真实模型会话与唯一回复保留。主线程另行连接实际 `dsh-app:` 文档，独立确认 `READY`、门禁不存在和 marker 可见，证据为 `desktop/restart-result.json`、`independent-result.json` 与 `independent-desktop-restored.png`。首次测试的系统 opener 捕获超时，以及重复写同地址时命中 READY 保护的 403，均为验收脚本问题，修正后通过，没有为测试放宽登录边界。

rc.3 桌面发行接缝已同步官方八语言菜单和 `CFBundleLocalizations`，Windows 安装器品牌切到官方 JSON 解析器接缝，保留格式占位符和键校验。账号菜单保留新增通知 `renderSlot`。macOS 两处 App 打包路径、appId 默认值和显式 `--user-data-dir` 也已适配。9 项文件已逐字节整合回桌面主工作区，未提交。整合后重新运行 `npm test`，20 项中 18 项通过、2 项 Windows/PowerShell 平台项跳过，零失败。

安装包构建实际经过官方 10 个构建 gates 和 398 workspace frozen install，并通过打包运行时的原生依赖、离线插件安装/删除，以及 DOCX/XLSX/PPTX 转 PDF、图片渲染、转换和重算检查。相关证据为 `desktop/build.log`、`package-result.json`、`launch-result.json` 和 `model-result.json`。Windows 与 macOS Intel 未实际构建运行，不能从 ARM64 结果推导通过。

本次 DMG SHA-256 为 `da15e7d641ca794a68e2d67961eff0437d1a1632fdb7d81fdbae28e56cd4aa3d`，ZIP 为 `5d3a77290f02542b37445f0e8dd5d9fa2eed053eb96a9e6cdc5e4410e792c1aa`。制品保留在桌面隔离 worktree 的 `.build/official-harness/apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/`。

**该实包是私有候选制品。** 构建时临时 HTTPS registry 按 SHA 提供本轮未发布的 beta.20 tgz，未替换公共 npm 包。同版 beta.20 在公共 npm 上可能仍是旧内容。正式交付前须将插件升到新版本并发布，再更新桌面锁的 pluginVersion 和重新打包；不能直接将当前公共 beta.20 安装结果算作 rc.3 兼容。

补验结束后保留单套本机 Java/Console/PostgreSQL/Redis 和已登录的独立桌面 App，供用户查看；主机服务与日常 profile 未替换。临时 HTTPS registry 和本轮六个授权浏览器标签已清理，桌面协议注册已恢复指向原 `/Applications` 安装。测试 App、数据与安装包仍位于被忽略的补验目录，未发布。

### NAS 双机进度

NAS 的原管控台与旧 Host 没有被替换。本轮在 `/vol1/1000/docker/stacks/owndsh/rc3-supplement-20261113` 创建独立数据库、Redis、Java 与静态 Console，拟用 `18082` 和独立 rc.3 Host 验收。当前 Java JAR SHA-256 为 `4de81926d947f94254b7425304a63f0d2d65707e7ac3573885148d2720b07537`，已传 NAS 并核对。

NAS 安装期间 SSH/Tailscale 多次失去响应。用户反馈恢复后，首次 SSH 能返回 uptime、容器状态及 `OwnDsh Server started`，随后新的 Tailscale 和 LAN SSH 再次卡在握手。最后内存快照为 3,901 MiB 总量、370 MiB available、1,950 MiB swap 已满；这些快照只能证明当时存在资源压力，尚不能断言失联由 OOM 引起。原 LAN `18080/healthz` 曾返回 200，新 `18082/healthz` 超时。停止本轮挂起安装容器的 SSH 命令尚未确认完成。

**NAS rc.3 双机未验收。用户确认 NAS 未恢复且资源不足，已明确停止本轮 NAS 测试，改用本机验收。** 同 Mac 双 Host 与旧 rc.5 的历史结果均不替代本项。NAS 恢复后先停掉本轮 `vigilant_mestorf` 安装容器并检查独立服务。后续如重启验收，应使用已生成 Linux lock，并限制安装内存。待清理的独立容器为 `owndsh-rc3-verify-server`、`owndsh-rc3-verify-console`、`owndsh-rc3-verify-redis` 与安装容器。尚未确认清理完成。

## 后续可删除的接缝

`readResource` 可在独立改动中替换本机静态装配 HTTP 回环，前提是继续使用已有 loopback + owner admission，并保留 metadata POST 与业务 carrier。它不替代企业 Noise/lease 或目标代码信任边界。

官方 manager 当前只覆盖非 OAuth fleet 生命周期，不足以替代 SDK OAuth provider、企业 owner/target、租约和曝光策略。官方 client 提供 authProvider 且 D08–D13 真实验收通过后，才能删除 OAuth 连接组合。官方 admission 进一步收敛旧快照结构，也必须先证明 PTC binding 和 native 下一步加载策略保持。

## 发布与自动更新记录

用户已授权将本次已验证源码发布为 `owndsh-plugin@0.1.0-beta.21` 的 npm `next`，再发布预置该精确插件的 `OwnDsh Desktop v0.2.2-rc.3`。插件使用现有标签 Trusted Publishing，桌面使用现有三平台 GitHub Actions；补验阶段的 beta.20 私有候选不直接对外发布。

OwnDsh commit `7b36b36c73f14215fb74181de8ea865e8304fe9c` 与标签 `v0.1.0-beta.21` 已推送。发布流水线 [43435877761](https://github.com/boe1900/owndsh/actions/runs/43435877761) 的插件检查、npm 发布、服务端和管控台镜像均成功。npm 公共仓库已返回 `next=0.1.0-beta.21`。实际下载的 53 文件 tgz 通过 registry SHA-512 校验，25 个 DSH peer 全部精确锁为 `0.2.2-rc.3`，两份 bundle sourcemap 的源码内容哈希集合与本地审阅包一致，并携带 GitHub Actions SLSA provenance。公开 tgz 的 SHA-256 为 `786706e05e0d119ed169c0ef23e23ef2dd444b4322bde3a54bfe28d404b50b0a`。证据为 `release/npm-beta21.json`、`npm-verified.json` 和 `npm-publish-ci.log`。

桌面 commit `b05d4e51c8089b3594b1c46ce8845ba2fb1081fb` 与标签 `v0.2.2-rc.3` 已原子推送，预置插件锁改为公共 `beta.21`，README 同步当前发行版本。再次运行接缝测试得到 18 项通过、2 项本机平台跳过、零失败。三平台发行由 [43437067760](https://github.com/boe1900/owndsh-desktop/actions/runs/43437067760) 执行，Windows x64、macOS ARM64、macOS x64 和 Release job 全部成功。两个 macOS 平台均校验 App 与 ZIP 内 App 的 deep strict 签名和稳定 designated requirement，实际安装依赖日志均确认 `beta.21`。

[OwnDsh Desktop v0.2.2-rc.3](https://github.com/boe1900/owndsh-desktop/releases/tag/v0.2.2-rc.3) 已发布，GitHub `releases/latest` 已指向该版本，非 Draft、非 GitHub prerelease。实际核对 10 个资产齐全，包含三平台安装文件、blockmap 和两个 feed。`nightly-mac.yml` 同时包含 ARM64、x64 ZIP，版本为 `0.2.2-rc.3`，文件名与大小匹配 Release 资产；Windows feed 版本也一致。证据为 `release/desktop-ci-result.json`、`desktop-release.json`、`release-verified.json` 与 `feeds/`。Windows 和 Intel 本轮完成真实平台构建及门禁，但没有真机 UI 或自动更新验收。

实际更新从用户原 `/Applications/OwnDsh Desktop.app` 开始，版本为 `0.2.1-rc.5`。原 `app.asar` 内 `dsh/node_modules/owndsh-plugin/package.json` 确认预置插件为 `beta.20`。旧 profile 的依赖字段残留 `beta.17`，但 profile 下该插件副本不存在，不能用这条记录判断实际加载版本。此次包内插件升级为 `beta.20 → beta.21`。发布前通过原生菜单检查更新，提示已是最新版本，截图为 `release/before-update-check.png`。原 App、`~/.owndsh` 与 Electron userData 已备份至私有 `release/before-update/`，原数据文件另存哈希清单。候选隔离 App 已退出，避免把先前实包验收当成此次更新结果。

Release 发布后准备点击原 App 检查更新时，电脑工具报告 Mac 已锁定且自动解锁失败，要求用户手动解锁。已请求解锁；此时原 App 尚未开始本轮下载和安装，不能将 feed 校验或之前候选安装结果当成自动更新通过。
