<!--
[INPUT]: 现有 Console 与 Remote 实现、锁定版本的原生 DSH Web Client、Remote 在线页面、用户提供的空间切换示意、NAS→Mac Office、表格只读及 Edge 原生隔离交互 HTML 验收。
[OUTPUT]: 管控台侧栏设备入口与远程 DSH 独立标签方向、原生 UI 复用边界、预览能力矩阵和初版实施验收状态。
[POS]: 原生工作区产品预研及初版范围记录；插件端实施契约仍由 remote-dsh-workspace-design.md 管理。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 管控台远程设备入口与原生 DSH 工作区预研

日期：2026-11-12。状态：初版已实现并部署 NAS，后续源码与验收进展见追加章节。跨机结果见 [NAS 部署与右栏验收](console-nas-cross-machine-verification.md)，其中 NAS Host 已完成真实模型与右栏格式测试，NAS 管控台到 Mac Host 已完成文件、终端及 DOCX/PPTX 预览测试。NAS DSH 曾被 OOM 杀死，已恢复环境，内存增长来源与早期断链原因仍待查。第 1 至 5 节为现行产品契约，第 6 至 8 节保留历史预研依据，第 9 节保留初版实施记录。

本轮解决一个问题：用户在 OwnDsh 管控台中选择自己的工作电脑，进入该设备的原生 DSH 工作区，继续对话并查看成果。预研先确定页面、交互和能力边界，随后按用户要求实现初版，复用既有加密连接协议，不增加远端网站代理。

现有插件端整页远控的实现与验收仍以 [DSH 远程工作区设计](remote-dsh-workspace-design.md) 为准。其双机结果不能代替新管控台浏览器客户端的验收。

## 1. 侧栏设备入口与独立远程标签

管控台侧栏正文增加“远程连接”分组，列出当前账号自己的设备名称和连接可用性。在线、远控开启且版本支持的设备使用原生 `<a target="_blank" rel="noopener noreferrer">` 打开固定设备的 `/workspace.html`。管控台当前路由、页面 tab 和表单仍留在原标签，设备不进入产品 tabs。不可连接项没有 href，名称与原因可由键盘和辅助技术读取。

目录沿用本人 Cookie API 与 Query 缓存，提供手动刷新、初始加载、空列表和失败提示。刷新失败保留旧设备并注明状态可能过时。折叠后保留设备图标、完整可访问名称和状态；移动设备点击链接后关闭抽屉。目录可用性只是入口提示，实际授权、占用与版本条件仍以建链裁决为准。

账号菜单删除设备和刷新操作，仅保留邀请成员、用户中心和 Sign out。早期 `/remote` 诊断页及导航已删除，远控统一从本人设备分组进入；普通员工仍进入 `/account`，从同一侧栏访问本人设备。连接失败、占用与接管提示由独立工作区页面提供。

原生远程页保留官方工作区树和品牌按钮的新会话行为。独立身份条显示固定设备名、文字连接状态与真实的新标签管控台链接。身份条是原生 `#root` 的兄弟节点，通过 flex 分配剩余视口高度，不覆盖原生内容。连接状态为 connecting/connected/disconnected，只有官方 boot 成功后显示已连接，断线与启动失败使用同一反馈入口。

切换浏览器标签保持当前远程连接。身份条打开管控台不关闭当前远程页；关闭或离开远程页由原有 pagehide 释放 link，BFCache 恢复重新建链。错误边界的“返回管控台”仍离开当前页并释放。单 Host 单控制 link、busy 提示、不抢占、不跨标签共享和不重放 mutation 保持不变。界面释放不等于停止 Host 已受理的 Agent 任务。

草稿、当前会话、滚动位置与预览目标按账号和远端设备隔离，会话相关状态再按会话隔离。返回同一设备时恢复位置，不自动重发草稿或重放命令。跨设备不能继续展示上一台机器的文件内容。

## 2. 远程空间直接复用原生 Web Client

产品方向是复用锁定版本的原生 DSH 客户端装配。OwnDsh 维护设备入口、登录与设备授权、远程连接适配和必要的边界提示。消息、工具、审批、队列、工作区与预览继续由原生对应模块负责。

用户确认的能力边界为沿用原生 DSH 已提供的能力，原生明确不支持的功能不另行补做。已确认 Excel、CSV 预览为原生只读，编辑保存不列入 OwnDsh 待补能力。HTML 已移除 Console 强制静态覆盖，沿用原生隔离交互实现；实际浏览器验收结果与限制见第 4.1 节。

Beautiful UI 保留在管理控制台中。已有 Harness 示例可参考视觉和基础组件，但不作为远程会话运行时。它的 `PromptBar` 含演示模型、命令与来源，`ToolChips` 也没有完整 DSH 工具语义，不能直接充当产品实现。

原生客户端具有以下实际装配关系：

- `client/web` 负责浏览器启动，读取 Host 生成的 `WebBootGraph` 和 module-loader。
- `client/connection` 与 API Remotes 提供传输、生成的 Remote 方法、取消和连接 generation。
- Session、Workspace 的 Client model 保存 Host 状态镜像，并处理流与一元请求之间的竞态。
- `ui-session`、`ui-workspace`、`ui-conversation`、`ui-chat`、`ui-tool` 和交互插件组装界面。
- `ui-layout` 与 `ui-sidebar` 提供骨架，`ui-renderer` 在插件依赖就绪后挂载 root slot。

因此，复用单位是一套版本一致的客户端模块及其装配，不是复制几个 TSX 文件后直接传入聊天消息数组。优先使用官方发布包和既有构建方式；确需源码改动时，保存最小差异，并与 OwnDsh 当前支持的 DSH 版本一起升级。该基线为 MIT 许可，复用时保留版权和许可文件。

### 2.1 统一体验不要求共用一棵 React 树

采用独立原生 DSH document 与新浏览器标签，管理 tab 和远端位置各自保留。原生拥有自己的 body 主题、快捷键和插件生命周期，页面分开有助于维持这些边界。

当前插件远控页通过本机 DSH 供应 UI assembly，再把业务发送到远端。它的页面响应带有 `frame-ancestors 'none'`，不能直接放进管控台 iframe。新浏览器客户端也不能依赖用户始终运行一个本机 DSH 来供应页面代码。

预研需验证如何发布锁定的 Web Client 模块图和资源，以及如何把该 Client 的 Connection 接入现有 Remote carrier。初版已用构建期官方 Host 冻结静态装配，并接通浏览器 carrier，详见第 9 节。

### 2.2 保留原生品牌按钮

原生 `ui-sidebar` 的品牌外层按钮默认调用“新建会话”，品牌 slot 本身不提供替换整个按钮行为的接口。本轮删除旧空间菜单文件、SPACE_MENU/SPACE_NAME 全局接缝和构建时 sidebar 改写，官方品牌与侧栏源码不再为入口适配打补丁。设备身份与管控台入口由独立轻量身份条承担。

## 3. 功能按可用能力呈现

首个产品范围是本人设备、已有 DSH 工作区、新建或继续会话，以及这条流程必需的原生交互。2026-11-14 的后续扩展复用官方 Plugins/Discover、自动化任务和 More，操作进入远端 Host，不建立第二套业务页面。Bot、CodeX 工作区和运维不纳入。该扩展为待发布源码，支持范围与验收见[原生导航验收](remote-native-navigation-verification-20261114.md)。

原生已有某个入口，不表示 OwnDsh 浏览器远控已经支持它。未纳入当前范围或缺少远程能力的入口先不展示。已经呈现的交互必须能完成，不能点击后长期停在占位说明。

会话过程中出现的审批、用户问题、上传失败或工具错误不能按“先少放功能”省掉。这些是会话能够继续运行的必要反馈。

| 原生交互 | 产品要求 |
| --- | --- |
| 消息和运行状态 | 保留 user、steering、reasoning、重试、压缩、失败、停止及完成语义，流式和历史展示一致 |
| 工具调用 | 保留调用树、子调用、准备中、运行中、失败和停止状态，参数与结果可展开 |
| 专用工具内容 | 按原生规则显示文件读取、搜索、diff、命令输出及文件跳转，不统一降成文本气泡 |
| 生成时输入 | 保留原生 steer 与 queue 的规则、提示和操作，不一律锁住输入框 |
| 停止生成 | 主操作随运行状态和草稿状态变化，保持原生 Stop 规则 |
| 附件 | 完整产品需沿用原生失败、重试和移除语义；初版关闭文件 intake，不提供上传入口 |
| 审批和用户问题 | 由原生交互接管输入区域，提交、拒绝、取消和过期都有明确结果 |
| 模型、权限和命令 | 读取目标设备实际可用目录与状态，不使用 Harness 示例里的硬编码项目 |

预研时普通 employee 会进入 403。初版已将本人工作区资格与管理权限分开，普通员工进入现有 `/account`，通过侧栏设备分组访问本人设备，不开放管理页面。

## 4. 右侧预览可以保留，能力分开判断

“预览 AI 做好的页面”至少包含两种不同需求：读取生成的 HTML 文件，或访问 AI 启动的网站。前者可以沿用原生文件读取与预览机制；后者还需要浏览器能访问远端服务。

| 成果或地址 | 已核实的源码事实 | 管控台的产品边界 | 新浏览器远控实测 |
| --- | --- | --- | --- |
| 文本、代码、Markdown、图片 | 原生注册相应文件 renderer，文件通过 `remote.workspaceFiles` 读取 | 优先沿用原生预览，保留文件路径和加载失败状态 | NAS 实测文本、JSON、Markdown、PNG 及相对 PNG/SVG 通过 |
| 单文件 HTML | 原生支持 `.html`、`.htm`，由 developer tools 配置选择静态或隔离交互预览 | 已恢复官方配置，当前冻结 metadata 开启交互，脚本在 opaque iframe 内运行 | Edge 的 NAS→Mac 和同文件原生 DSH 对照均通过脚本、按钮及父页面隔离验收，重新读取、刷新和重连后可继续交互 |
| HTML 的相对 CSS、JS | 原生交互预览按条件读取并打包直接声明的资源 | 复用已有加密文件读取及工作区 realpath 授权，不提供完整应用托管 | Edge 中相对 JS 执行、CSS 生效；越界、symlink 越界及缺失依赖显示预览失败，连接保持正常 |
| PDF、Office、Excel | 原生注册相关 renderer，Excel/CSV 组件明确只读 | 逐格式核验被控 Host 的依赖和远程准入，沿用表格只读边界 | NAS Host 的 PDF、Excel、CSV 查看通过；NAS→Mac 表格输入尝试及重新读取后源文件哈希不变，原生不支持编辑保存；Mac 的 DOCX/PPTX、普通 PDF 和文本预览通过，NAS Host 原生 Office 转换仍不可用 |
| 远端 `localhost:5173`、`127.0.0.1:3000` | 原生网站面板直接使用目标 URL，当前 Console 不装配该面板 | 当前 Remote 未提供任意 dev server 代理 | 双机同端口实测，NAS shell 返回 NAS 标识，Mac 浏览器点击远端 Markdown 链接返回 Mac 标识 |
| 浏览器可达的网站 URL | 原生网站面板可以使用 iframe，当前 Console 不装配 | 还受站点嵌入策略、HTTPS 混合内容和登录环境限制 | 未作为右栏能力提供；只验收普通链接打开新标签 |
| 第三方插件专用预览 | 需要对应 Client renderer、依赖和远端 API | 按插件核验，远端安装插件不代表管控台自动获得它的 UI | 未做 |
| Desktop webview、系统打开文件 | 依赖桌面运行端提供能力 | 浏览器不承诺提供桌面专属能力 | 不纳入当前范围 |

Office 转换在被控设备执行，Console 与 Java 只通过现有加密链路转发原生请求和结果。被控 Mac 的原生转换可用时，NAS 作为管控台及 Relay 无需安装转换引擎；NAS 自身作为被控 Host 时需独立满足其原生转换依赖。当前已验收 DOCX、PPTX 样例，不代表所有 Office 格式或复杂排版都已验收。

### 4.1 HTML 沿用原生隔离交互预览

Console 已删除构建脚本将 `interactivePreview` 固定为 false 的覆盖，保留官方 `configForms.developerTools.enabled`。当前该值来自构建期冻结的 `/api/settings/describe` metadata，`ui-settings.value.enabled=true`，不是远端 Mac 当前偏好的实时副本。此次没有新增设置 API 或修改远端设置。

原生交互预览使用 Blob URL 和 `sandbox="allow-scripts"`，不授予 `allow-same-origin`，不向 frame 注入 Host 或加密 transport。主页面只执行锁定的插件模块，工作区 HTML 脚本只进入隔离 frame。此模式不带静态分支的禁网 CSP；外部绝对 URL 按浏览器网络及 CORS 规则处理，不能称为网络隔离，也不会自动经 Mac 转发。

原生通过 `workspaceFiles.readBytes(sessionId, relativePath, { baseFile })` 读取相关文件，只打包 HTML 直接声明的相对 `.js` 经典脚本和 `.css` 样式表。现有授权同时约束基准文件与实际资源的 realpath。NAS→Mac 实测，引用工作区外文件、指向外部的 symlink 和缺失 `.js` 均显示“无法预览这份 HTML 文档”。

这条打包路径不递归处理 JS module、CSS `url()`、CSS `@import` 或运行时 `fetch`，也不自动打包相对图片。存在 `base[href]` 时跳过相关资源打包。原生限额为单资源 4 MiB、总量 32 MiB、最多 64 个资源。资源读取失败或超限使本次交互预览失败，不自动退回静态模式。OwnDsh 沿用这些行为。

2026-11-12 在用户授权的 Microsoft Edge 中完成 NAS→Mac 真实验收。内联脚本、直接声明的相对 JS/CSS、按钮连续点击均成功，父页面 DOM、父页面 Storage 和 opaque frame 自身 Storage 访问均被拒绝。重新读取文件、整页刷新和手动断开重连后，脚本及按钮仍可用。工作区外资源、外部 symlink 和缺失依赖均显示预览失败，随后普通文本预览正常；7 个夹具源文件哈希未改变。同一 Mac Host 的原生 DSH 在 Edge 打开同一份 HTML，也通过全部脚本、资源、隔离标记及按钮对照。因此原生隔离交互 HTML 预览在 Edge 可用，当前远程方案已完成该项验收。

此前 Codex IAB 中的 NAS→Mac 和 Mac 原生 DSH 均产生空白 Blob iframe。最小对照页的简单 Blob、原生 document.write Blob 同样空白，而 srcdoc 控制组显示 `SRCDOC_SCRIPT_PASS`。这些历史观察只证明 IAB 与本次 Edge 的行为不同，尚未确定 IAB 内部原因；没有为此修改原生 sandbox 或 renderer。完整验收矩阵与证据见 [NAS 部署与右栏验收](console-nas-cross-machine-verification.md)。

此前静态模式的 `SCRIPT_NOT_RUN`、空 sandbox 和 CSP 验收保留为历史记录，不代表当前 Console 仍强制关闭交互。“生成了一个 HTML 文件”与“启动了一个 React 网站”仍是不同能力，开启此模式不提供远端 dev server 代理。

### 4.2 运行中的网站是后续独立能力

远端程序绑定的 `localhost` 属于远端电脑；管控台中的 iframe 执行在访问者的浏览器里。Java 协调服务能接收 Remote 连接，并不让浏览器自动获得那个网站的访问地址。

若后续要支持 Vite、Next 或其他服务，需要单独研究远端端口访问、HTTP 和 WebSocket、HMR、资源路径、认证及隔离。只有目标浏览器可实际访问，而且页面允许被嵌入，才能显示网站。已知只支持文件预览时，不展示一个承诺能打开 dev server 的网站入口。

### 4.3 文件操作保持当前可信工作区边界

现有插件 carrier 放行 `workspaceFiles/read`、`readBytes`、`stat`、`list`、文件变化与媒体读取。文件路径经过可信工作区及 realpath 约束。它提供了远端文件预览所需的基础，但不等于允许读取整台电脑，更不等于有任意 HTTP 服务代理。

点击成果后，预览区显示文件路径、加载状态和实际支持的操作。文件不存在、关联资源读取失败、类型不支持、加载超限和远程断线分别给出原因，不能都显示成“网络错误”。断线后若保留最后的内容，应标明它不是最新读取结果。切换设备后移除旧设备的预览实例。

## 5. 页面状态必须表达真实连接阶段

| 情况 | 页面反馈与操作 |
| --- | --- |
| 未选择设备 | 从侧栏远程连接分组选择本人设备 |
| 设备离线或未启用远控 | 指明设备及原因，允许在原管控台刷新设备状态或选择其他设备 |
| 正在连接 | 显示阶段，原生 Client 就绪前不允许发送或执行命令 |
| 被其他页面占用 | 显示设备正在被使用，保留目标和草稿，提供重试，不归为网络错误 |
| 连接断开 | 保留位置，暂停 mutation，按现有恢复规则重连，不自动重放请求 |
| 登录失效或设备撤权 | 立即停止远程操作，进入对应身份状态，不用本地页面兜底 |
| 已连接但某功能缺失 | 隐藏未提供的入口；会话里已经引用的内容显示具体不可用原因 |

上游在线页面的 LAN、端到端加密等标签只代表上游当时的状态。OwnDsh 按实际协商结果显示，不能把参考图中的标签复制为本产品已验收能力。

## 6. 历史空间切换原型与验证范围

旧方向的本机视觉稿位于 `.tmp/console-workspace-research/prototype/index.html`，预览地址为 `http://127.0.0.1:18872/`。它以用户 HTML 示意为基础，移除了远程侧的无关功能菜单和新建目录入口。样式使用本仓库已安装的 Tailwind 与字体，不依赖演示稿里的 CDN。

历史原型已在浏览器检查从管控台打开空间菜单、切到 DSH 空间、切回管控台的视觉流程。该方向已由第 1 节的独立标签方案替代。历史 HTML 只演示空间切换，内部会话、工具、模型和统计均为静态示意。它没有移植原生 Client，也没有连接真实设备。

早期 Beautiful UI 草稿比较过目录分组与单工作区，并演示了草稿隔离、占用提示和静态 HTML iframe。用户提供的原生空间切换稿已取代该布局方向。早期草稿中的 HTML 展示只证明本地演示文件能显示，不证明远程文件预览已经接通。

本地截图及原始参考保留在 `.tmp/console-workspace-research/`，不把用户会话正文和在线参考截图提交为公共文档资产。预研阶段没有修改产品代码；后续初版已修改 Console、共享 Remote core 和服务端本人设备授权，未部署 NAS。

## 7. 历史预研提出的验证问题

早期技术验证围绕原生 Client 的浏览器装配展开，不继续制作另一套聊天 UI：

1. 在独立页面加载锁定版本的原生 Client 模块图及其依赖，完成挂载和卸载。
2. 把该页面的 Connection 接入现有加密 Remote，核验 API、流、Fetch、附件和事件回答。
3. 用实际设备完成工作区列表、新建或继续会话、工具调用、审批、steer、queue 及重连恢复。
4. 单独验证原生文件预览，至少覆盖文本、图片、默认静态 HTML、受限交互 HTML及缺失关联资源。
5. 验证空间切换后的草稿与文件隔离、单 Host 连接释放和登录失效。

这些是完整产品的证据要求，初版已验证部分列于第 9 节。远端 dev server、任意插件 UI 和桌面专属功能不因原生界面复用而自动纳入。

## 8. 证据与版本

OwnDsh 源码基线为 `332bf504e8d82c82eacf4e4a9ce0dcfa8a9c7e2a`。进入预研时已核对 `origin/main`。主要事实来自：

- [现有原生工作区传输适配器](../plugin/packages/bundle/src/remote/view-mount.ts)：本机 UI assembly、远端业务分流与页面嵌入限制。
- [远端业务权限边界](../plugin/packages/bundle/src/remote/dsh-policy.ts)：API allowlist 与文件路径约束。
- [管控台角色门禁](../console/src/routes/_console.tsx)及 [工作区模块地图](../console/src/features/workspace/CLAUDE.md)：现行角色门禁与本人设备入口。预研时的 P0 诊断模块已删除。
- [Harness 示例](../console/src/examples/harness-example-page.tsx)及 [SidebarNav](../console/src/components/primitives/SidebarNav.tsx)：既有 Beautiful UI 基础。

原生源码基线为 DeepSeek Harness `0.2.1-rc.5`，commit `b830ec950faba0a46dda564be3e2d854afed94f1`：

- [Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/subsystems/web-client.zh.md)：module graph、Client model、Conversation 与 Slots 的所有权。
- [UI renderer](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-renderer/src/client/index.ts)：装配完成后的 root 挂载。
- [侧栏注册](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-sidebar/src/client/index.ts)及 [SidebarRoot](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-sidebar/src/client/SidebarRoot.tsx#L271)：可扩展位置与品牌按钮行为。
- [原生 InputBar](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx#L314)：运行中输入及主操作规则。
- [文件预览装配](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-sidebar-documentpreview/src/client/index.ts)：格式 registry 与工作区文件读取。
- [静态 HTML](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-sidebar-documentpreview/src/client/html/basic-document.ts)、[HtmlBody](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-sidebar-documentpreview/src/client/html/HtmlBody.tsx)及 [资源打包](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-sidebar-documentpreview/src/client/html/pack.ts)：静态与交互模式的具体边界。
- [Web 浏览器面板](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-sidebar-browser/src/client/view/IframePresentation.ts#L71)：直接使用目标 URL。

Remote 公开源码基线为 `d91ff98f60231efbdeaf304e36e1f69fc6f66fbc`。已查看用户 Edge 中的在线 Remote 页面。公开仓库的 [说明](https://github.com/liguobao/ds-harness-remote/blob/d91ff98f60231efbdeaf304e36e1f69fc6f66fbc/docs/README.md)指出完整 Web 与 Admin 位于独立 Server 项目，公开 Browser App 主要负责跳转。因此本轮将线上页面作为产品参考，不声称已取得其完整 Web 源码。

## 9. 原生工作区初版实施状态

本节保留初版完成时的实施记录，当时未提交、未部署 NAS，使用隔离本机 Server、PostgreSQL、Redis 和真实 rc.5 Host。本轮随后已将应用制品部署 NAS，现状与未关闭问题见 [跨机验收报告](console-nas-cross-machine-verification.md)，不把下述本机证据当作本轮双机证据。

### 9.1 登录、连接与代码来源

`GET /enterprise/console/v1/remote/devices` 和 `POST /enterprise/console/v1/remote/devices/{deviceId}/ticket` 复用浏览器 HttpOnly Cookie，仅处理本人设备。ticket 绑定本次 Console 登录；浏览器只能作为 controller。持续授权沿用现有 owner、设备状态、Host pin、capability 和登录租约，不把登录成功视为永久授权。

插件和 Console 共用 `@owndsh/remote-core` 的 Noise IK、lease 和 carrier。Remote wire hash 保留已发布值，HTTP OpenAPI 增加 operation 不改变旧插件握手身份。`workspace.html` 的网络请求和文本 mux 经加密 link 到达目标，mutation 不自动重放，也不回落本机 Host。

`console/scripts/build-native-workspace.mjs` 在构建机启动固定 rc.3 官方 Host，冻结模块图、资源和三项启动 metadata。管控台主页面只执行随 Console 发布的插件代码，不执行目标设备供应的插件 JS；工作区 HTML 由原生隔离 iframe 承载。启动失败、文件 intake、图片及 Markdown 复制接缝由源码 hash 门禁保护，HTML 模式与 More 菜单不再改写。升级原生包需要重新核验这些接缝。

### 9.2 当前支持与裁剪

原生侧栏保留目标已有工作区、新建及已有会话。消息、工具和审批组件仍由原生模块装配。账号和设备分别隔离浏览器 Storage，远程页独立持有连接，离开该页后释放 link。连接失败显示具体原因，当前 Host 仍只有一个控制 link。

首版关闭文件选择、粘贴及拖放 intake，保留原生附件栏和历史展示。底层上传服务与配置表单仍是原生模块依赖，不通过禁用服务来隐藏入口。设置页、任意目录创建和原生网站面板不装配。当前源码已恢复原生插件管理、Discover 和自动化任务，More 完整保留打开、固定、浏览插件和创造模式草稿入口。Creator 复用 `uiWorkspace.startSession` 初始化 `cordis` 会话并填入提示词，不自动发送。动态插件审批、运行及新界面加载尚未远程接通；管理安装也不等于装载任意第三方 Client 或支持它自带的配置页面。

`ui-agent-preset` 同时恢复原生新会话预设选择和对话头部模式标识。列表来自目标 Host 的 `agentPresets/list`，未开始会话通过已有 `agentPresets/select` 切换，已开始会话沿用原生只读规则。隔离浏览器已核对标准、PTC、极简、创造模式与远端 Session 投影一致；Creator 草稿显示创造模式，刷新保留模式和草稿。默认预设配置和 Coding Tools 设置仍受现有静态 settings metadata 边界限制，本轮未开放设置写入。

Markdown 内嵌图片、图片文件链接的悬停组件及插件文档图片共用远端媒体接缝。`/api/file` 和两条精确插件 detail-file 路径经加密 link 读取为组件拥有的 Blob URL，换图、取消及卸载时释放。外部图片 URL 保持原生行为。HTML 沿用原生配置与隔离交互 renderer，当前冻结 metadata 启用交互。配置来源、脚本和网络边界及 Edge 验收结果见第 4.1 节。

### 9.3 入口调整前的既有验收

以下记录来自此前整页空间切换实现，不能证明本轮新标签入口、折叠/移动侧栏或身份条已通过真实浏览器验证。

| 项目 | 当前结果 |
| --- | --- |
| 普通员工 Cookie 登录、本人设备发现 | 真实浏览器通过，进入 `/account` 且没有管理菜单 |
| 左上角进入设备、返回管控台、再进入 | 真实浏览器通过，重新建链且恢复该设备会话位置 |
| 原生已有会话消息收发 | 真实浏览器通过，使用明确标注的本机模型夹具，经真实网关和 Host 返回回复 |
| 原生新会话消息收发 | 真实浏览器通过，沿用目标已有工作区 |
| 刷新恢复和重复发送 | 刷新后恢复会话与预览，夹具调用次数没有因刷新或空间切换增加 |
| 同一 Host 已被占用 | 第二页面显示“这台设备正在被另一个远程页面使用”，两种拒绝帧均有回归 |
| 工作区文件列表、Markdown、图片 | 真实浏览器通过，图片为远端读取的 Blob，600 像素自然宽度可见 |
| 单文件静态 HTML | 真实浏览器通过，原生 `srcdoc` sandbox 显示目标文件正文 |
| 上传入口 | 页面不提供添加附件项；源码及生成产物核验覆盖 picker、paste、drop 同一 intake |
| 图片悬停卡片 | 源码、生成产物及 JS 语法复核通过，尚无独立浏览器悬停验收 |
| 工具运行、审批、steer、queue、终端 | 保留原生模块和既有 Host 通道，尚未完成本浏览器入口的逐项业务验收 |
| PDF、Office、Excel、受限交互 HTML | 尚未按格式验收；交互 HTML 当前不开放 |
| 远端 localhost 网站、P2P、TURN、Android | 不属于本次实现和验收范围 |

本机模型夹具用于验证链路，不代表真实供应商、工具或审批专项通过。Server 相关测试、130 项 Console 测试、共享核心回归、本地生产构建及 Docker 构建已通过。真实非 root Nginx 容器验证了工作区 HTML、assembly 静态资源和本人设备 API 代理，未登录 API 返回 401 JSON。

### 9.4 本轮入口调整验证状态

本轮已完成侧栏设备分组、新标签远程页与独立身份条，删除品牌菜单接缝。直接 TypeScript 检查、130 项现有 Console 测试和完整生产构建通过。成功构建按当前资源表清理过期文件；148 项资源映射的文件和 SHA-256 均核对一致，输出目录不再包含旧品牌菜单接缝。两次独立只读审阅未发现阻塞问题。

本机真实 Server、rc.5 Host 与浏览器的本轮结果如下：

| 项目 | 结果 |
| --- | --- |
| 普通员工入口 | 本人设备显示在侧栏，账号菜单只保留账号操作 |
| 管理员完整布局 | 当时按用户要求给同一隔离体验账号增加 enterprise_admin；模型、访问策略、插件、技能、MCP、成员、活动记录、远程诊断与本人远程设备同时显示。此为历史验收，远程诊断现已删除 |
| 新标签链接 | 点击设备生成独立标签，原 Console 的 `/account` 页面保留；移动抽屉随点击关闭，链接带 target=_blank、noopener、noreferrer |
| 桌面与窄屏 | 展开和折叠侧栏入口均可用；390px 设备抽屉与原生工作区无 document 横向溢出；身份条高 40px，原生根节点占据剩余高度，输入区可见 |
| 原生交互 | 品牌按钮新建会话，三条测试消息（包含升级管理员后的继续对话）均完成真实网关、Host 与本机模型夹具的往返 |
| 持续连接 | 在 Console 操作数分钟后，同一远程 document 仍已连接并可继续收发；身份条打开新 Console 标签也不离开远程页 |
| 占用与释放 | 第二远程页显示明确占用原因；关闭第一个测试远程标签后，第二页显式重连成功；离开旧工作区同样释放 |
| 权限变更 | 角色变更令旧登录失效；浏览器和 Host 重新登录后，管理员菜单与远程连接均恢复 |

浏览器使用 Codex IAB，所有被检查的 document 均报告 visible。本轮持续连接结果不能证明 Edge 的后台冻结、节电或系统休眠行为。设备目录空状态、网络失败和大量设备滚动未逐项进行浏览器故障注入；工具、审批、终端和真实模型供应商仍沿用 9.3 的未验收边界。本轮无密证据见 `.audit/console-remote-entry-evidence.json`，截图和构建日志位于未跟踪的 `.tmp/console-remote-entry/`。测试环境保留，未提交、未推送、未部署 NAS。

### 9.5 主动断开与确认接管

原生工作区身份条提供“断开连接”，只关闭当前 document 拥有的 link。页面保留“已主动断开连接”，不会自动重连或重放业务操作；用户显式重连后才重新申请 ticket。失联遮罩同时设置原生根节点 inert，阻断键盘触达底层工作区。

占用页提供“断开旧连接并连接”。先读取本人设备的当前 linkId，再通过原生 dialog 确认；取消不执行写入。确认请求只撤销该 expectedLinkId，Gateway 在同一同步边界内撤销 Redis 授权并移除 link 后返回。若当前已无连接，重复请求成功；若已换成另一条连接，返回 409 ENT_REMOTE_BUSY，必须重新读取和确认。页面不会循环抢占。Host presence 和远端会话持久数据保留；被断开的旧页保留明确提示，不自动抢回。

HTTP 新增 GET `/enterprise/console/v1/remote/devices/{deviceId}/connection` 和 POST 同路径 `/disconnect`。两者都要求当前 Console Cookie 与本人设备授权，写入复用同源检查，不依赖管理员角色。只有 HTTP OpenAPI hash 更新，已发布 Remote wire 身份不变，不要求插件升级。该实现使用单节点共享 Gateway，不承诺多节点 owner fencing。

接管后迟到的已删除 link 帧被静默丢弃，避免向 Host 发送未绑定 link 的错误而误伤新连接；针对仍存在的他人 link 帧继续拒绝。Redis 撤销发生异常时断开旧 link 并返回失败，不向用户报告接管成功。

自动验证覆盖 HTTP owner/未知设备/同源/失效登录/输入边界、准确连接 CAS、重复与并发操作、真实 Redis 撤销、Host 在线和迟到帧隔离，以及前端确认、取消、重复点击、陈旧确认与手动断开状态。浏览器实测结果由本轮验收证据单独记录。

### 9.6 真实模型业务补充验收

2026-11-12 在隔离本机 Server、真实 rc.5 Host 和 Codex IAB 中接入用户提供的 Atria-Dawn，完成七轮真实对话、文件创建/读取/编辑、Shell 用例、原生 HTML 预览、停止生成、运行中断开重连、审批拒绝和允许一次，以及独立交互终端和终端重连。断开与接管的双标签、取消、旧 ID 409 和过期确认均通过；390 像素下占用卡片外框问题已修复。

这次结果补充 9.3/9.4 中尚未验收的对应业务项，不扩展远端网站、附件、steer/queue、格式矩阵、Edge 后台冻结或跨机器验证范围。一次取消请求缺少最终 usage，按既有 CHARGED_MAX 策略扣额，不能宣称取消请求零消耗。操作、文件校验、用量与未覆盖项见 [真实模型验收记录](console-remote-real-model-verification.md) 和 `.audit/remote-disconnect-evidence.json`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

## 10. Console 可选 Ego 浏览器接入边界

原生工作区构建加入固定 `dsh-ego-browser@0.9.14` 客户端；目标 Host 必须另行安装、启用同版本 Ego。Console 从密文 `/api/remoteClient/catalog` 读取可选能力，旧 Host、未安装、禁用或版本不符均不挂载浏览器面板，会话、文件与终端沿用原有链路。客户端代码只来自 Console 固定制品，Ego 独立 MIT 许可随 `/native-workspace/EGO_LICENSE` 发布。

面板复用 Ego 原生鼠标映射、键盘与 IME，开放 CDP 画面、页面/标签切换、点击、输入、导航、刷新、关闭标签和尺寸调整。登录态导入、Chrome 登录桥（包括具有启动副作用的 health）、插件设置、打开控制端真实页及弹出 Host 系统窗口均不装配。导航只允许 HTTP(S) 与 `about:blank`，不允许文件、脚本、data 或携带用户名密码的 URL。目标浏览器仍以远端 OS 用户权限运行，可访问该机器本来的 loopback 网页；这不是通用网站隧道。

共享契约以精确路由 ID、方法、无查询与严格 JSON schema 裁决，POST 上限64KiB；不接受任意代理路径或请求头。每 link 最多8个私有 watcher；stop 幂等删除，link 关闭等待已接受的本机 POST 截止后回收 watcher 和按键，常规 start/close 交错由此按序清理。本机写请求10秒截止不等于上游副作用已取消，stop 是尽力清理；极端迟到 watcher 由 Ego 原生120秒租约和至多5秒清扫兜底，空闲捕获另有1.5秒宽限。活动 watcher/画面每2秒复核插件状态，禁用或卸载终止 Ego 流而不关闭普通工作区。

输入每 link 保序，连续鼠标移动只在相同 target/buttons 的相邻段内合并，不跨点击或键盘事件。积压上限64项；HTTP/逻辑失败或队列满时停止后续输入，丢弃未发送操作并尽力释放按键/鼠标，显示重新连接提示。重连创建新适配器，不重放旧操作。非 CDP 捕获或关闭画面回传会显示明确原因并停止拉流。

这项接入只覆盖 Console `/workspace.html`。插件端 remote view 仍使用其本机 UI assembly，不能据此推导同样支持。FFmpeg/MSE、音频、下载、DevTools、触屏以及 Linux/Windows Host 不在本轮支持证据中。2026-11-13 已在 NAS 正式 18080 制品完成到 Mac 的 Edge 实测，覆盖真实模型打开网页、点击、中英文粘贴及退格、导航、刷新、尺寸预设、历史、关闭网页、切栏、断开重连和 watcher 回收；旧 NAS Host 的会话、文件和终端不受可选能力影响。具体范围见 [正式接入与验收](ego-remote-integration.md)，不沿用原型 PASS 作为正式结果。
