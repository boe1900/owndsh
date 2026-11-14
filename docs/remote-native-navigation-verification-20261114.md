<!--
[INPUT]: 固定 npm Harness rc.3 的官方插件管理、任务与 More 实现，Console assembly、Host carrier、边界测试及隔离浏览器实测。
[OUTPUT]: 记录三个原生入口的支持范围、精确准入、真实插件与任务验收，以及源码和生产部署的区别。
[POS]: Console 原生导航扩展的验收记录；承接远程工作区设计与 DSH 兼容性 D19，不替代发布和双机验收。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 远程原生导航验收

2026-11-14。用户要求在管控台远程工作区接入客户端的插件、自动化任务和更多。本轮复用官方 rc.3 界面及 Host 服务，未重新实现插件管理器或调度器。代码尚未发布或部署，生产 `beta.21` 插件及 Console 不包含这些变更。

## 1. 支持范围

| 入口 | 当前源码行为 |
| --- | --- |
| 插件 | 官方已安装列表、详情、包及组件启停、安装、更新、卸载和原生安装状态反馈。Discover 读取远端索引，支持搜索、选择版本和管理索引源。 |
| 自动化任务 | 官方创建、编辑、暂停、恢复、立即执行、运行记录、关联会话跳转、删除和清除已结束任务。数据和定时器均属于远端 Host。 |
| 更多 | 原生未固定面板目录、打开、固定到侧栏、浏览插件及创造模式草稿入口。侧栏、会话视图和右栏三个菜单共用官方实现。 |

插件启停和安装可能影响远控自身，沿用原生权限与生命周期。需要重启的包保留原生提示，本轮不新增桌面重启 API。关闭远程页面只释放连接，不取消 Host 中已创建的任务或已投递消息。立即执行成功表示持久化投递，不能单凭返回值认定模型已完成。

## 2. 实现与权限

构建恢复 `ui-plugin-manager`、`ui-schedule`、`entry-customization` 和 `ui-agent-preset`，显式插入 `ui-plugin-market` companion。官方默认 Web profile 未自动注册该市场页面。构建断言五模块都出现在 graph，生成 61 个 Client 模块和 166 项固定资源。首轮不含预设组件的导航验收使用 60 个模块和 164 项资源。

More 使用锁定 rc.3 的完整官方客户端，不再删除 Creator 菜单项。点击后沿用 `uiWorkspace.startSession(undefined, { agentPreset: 'cordis', prompt, whenDraftExists: 'append' })` 打开创造模式会话并填入对应区域提示词，不自动发送。原生打开、固定、浏览插件及菜单状态仍由官方代码处理。固定状态保留原生的内存语义，刷新恢复默认。

Host 复用现有精确端点集合，增加以下方法。

| 服务 | 精确方法 |
| --- | --- |
| `pluginManager` | `listBundles`、`listPlugins`、`registries`、`readBundleDetail`、`inspect`、`listVersions`、`setBundleEnabled`、`setPluginEnabled`、`removeBundle`、`installBundle`、`updateBundle`、`waitForInstall`、`cancelInstall` |
| `pluginRegistryProbe` | `fastest` |
| `pluginMarket` | `listIndexes`、`setIndexes`、`search`、`readEntryDetail` |
| `schedule` | `catalog`、`deliveryLimits`、`create`、`edit`、`run`、`history`、`deleteInactive` |

既有 `$events` 承载插件和任务变化，不新增独立业务流。编辑版本冲突、安装状态、任务持久化及投递由官方服务裁决，Controller 不自动重放 mutation。

插件文档图片新增两条只读路径。

| 路径 | 查询 |
| --- | --- |
| `/api/plugin-manager/detail-file` | 必需 `bundle`、`document`、`path`，可选 `sources` |
| `/api/plugin-market/detail-file` | 必需 `document`、`path` |

仅允许 GET 且无请求体。拒绝缺失、空值、重复、未知字段、控制字符及超过 8192 字符的字段值。包文件归属、路径包含关系和市场图片来源沿用官方 reader，不套用工作区 realpath，也不建立通用 URL 代理。图片共用现有 MIME 检查、Blob 所有权和取消释放机制。

`settings/describe`、`dynamicCordisRunner/syncInspectManifest` 和 `dynamicCordisRunner/inventory` 仍为构建期固定 metadata。普通 settings mutation、credentials、动态 Cordis、桌面 opener/restart、版本兼容豁免及未知方法仍拒绝。owner Peer 表示原生身份，不代表 carrier 放行所有 owner API。

安装新插件不会向 Console 主页面加载其 JavaScript。第三方插件自带页面、配置 slot 或专用预览不自动纳入，需另行核验。Creator 仅初始化会话草稿；生成后的动态插件审批、运行和新界面加载尚未远程接通。

## 3. 真实浏览器结果

环境使用独立临时 `DSH_HOME`、官方 `0.2.2-rc.3` Web Host、真实 `openDshCarrier`、Console `createNativeTransport` 和完整冻结 assembly。浏览器为隔离 Playwright 实例。本地 npm registry 提供真实 `1.0.0` 与 `1.0.1` tarball，测试包只注册一个无副作用的 Host 插件。模型使用本地确定性协议 fixture，不调用外部供应商。

| 场景 | 结果 |
| --- | --- |
| 三个导航入口 | 页面实际显示插件、自动化任务和更多。 |
| 插件详情图片 | 测试 README 的 PNG 经 carrier GET，DOM 为 Blob URL，图片自然宽度为 1。 |
| 插件启停与持久化 | 组件及整个包停用后可恢复，组件停用经页面刷新后仍保持。 |
| 真实升级 | 原生确认更新，Host 从本地 registry 安装 `1.0.1`，详情显示新版本。 |
| 卸载、发现及重装 | 卸载后通过 Discover 搜索，选择 `1.0.0` 安装并立即启用，Host 回显正确。 |
| 索引源修改 | 删除唯一索引后进入原生空态，再添加相同索引恢复目录，经过远端 `setIndexes`。 |
| 任务 CRUD 与启停 | 手动创建、修改名称、暂停、刷新读回、恢复和确认删除通过，独立官方 catalog 读回已删除。 |
| 立即执行及会话 | 真实运行记录出现，点击关联会话进入实际接收 Session，看到模型响应。 |
| 更多 | 首轮验收中任务取消固定后进入 More，可打开和重新固定，浏览更多插件可进入插件页。当时 Creator 被裁剪，后续恢复的验证单独记录。 |
| 关页自动运行 | 经 carrier 创建 3 秒后执行的任务后离开原 document，Host 模型请求从 1 次增为 2 次；重新打开可见已结束任务与投递记录。 |
| 清理已结束任务 | 页面确认清除后，独立官方 catalog 返回空数组，原会话仍保留。 |

全流程脚本通过 11 组检查，随后单独通过清理已结束任务。脚本、JSON 结果和截图位于本地忽略目录 `.tmp/remote-native-navigation-20261114/`。`proof-server.mjs` 每次启动创建新 Host 和测试包，`browser-verification.js` 使用 ready 文件对应 origin 后可重跑。早期手动探索中的等待超时来自定位按钮名称及原生安装完成弹窗差异，最终全新环境脚本通过，无需修改生产代码。

## 4. 回归与独立审查

- Console `pnpm run check` 通过，包括生产构建、TypeScript 和 24 文件的 167 项测试。
- 实施阶段 Host HTTP、WS、carrier 与 Noise 回归 5 文件的 26 项通过，Console 针对性 5 文件的 20 项通过，两侧类型检查通过。
- 独立 reviewer 在合回后的主工作区复跑 6 组 30 项测试，通过并确认无阻塞问题。覆盖 More 实际 factory 菜单、图片、插件和任务准入及前轮 Markdown 和团队开关修复。
- GEB 文件契约、局部地图和全局范围同步，`git diff --check` 通过。

这些数字来自不同检查集，存在重叠，不相加为总用例数。

## 5. 验收边界

本轮验证原生页面到 Host carrier 的业务闭环，没有重跑生产登录、Noise/Relay、NAS 双机、Docker 镜像和桌面安装包。未使用、修改或停止日常生产设备。插件端 remote view 仍使用控制机器的 UI assembly，本轮结果不作为该入口的浏览器验收。

市场文档 CDN 图片、真实安装取消、任意插件配置页面及需要重启的包未做实际浏览器验收；相应允许方法和图片路由有网络边界回归，不能将其等同为所有第三方包均可用。

发布需配对交付新 Console 和远端 Host 插件。当前 npm 包版本号仍是 `0.1.0-beta.21`，仅为源码版本字段，未重新发布同版本包。只升级 Java Server 不会启用这些入口和 Host 准入。

## 6. 创造模式入口与预设选择补验

后续检查发现两处人为裁剪。More 的构建期替换删除了 Creator 按钮；`ui-agent-preset` 被禁用，导致标准、PTC 等选择器与对话模式标识缺失。第一处已删除整个补丁及其构建接缝，第二处恢复官方模块并加入构建图断言，均未增加 Host 权限。修复前真实浏览器已证明 Creator 可以在后台建立 `cordis` 会话，但页面没有预设组件，不能据此判断选中了错误模式。

在同样的独立真实 rc.3 Host、carrier、固定 assembly 和隔离浏览器中补验以下结果。

| 场景 | 结果 |
| --- | --- |
| 预设菜单 | 标准、PTC、极简、创造四项可见；标准、PTC、极简的选择分别读回远端 `standard`、`ptc`、`minimal`。 |
| 直接选择创造模式 | 通过预设菜单选择后，页面显示创造模式，Host 投影读回 `cordis`。 |
| 创建插件 | More 的 Creator 显示创造模式，Host 投影为 `cordis`，草稿为对应区域提示词。 |
| 刷新草稿 | 创造模式与提示词保留，模型请求计数仍为 0，未自动发送。 |
| PTC 实际对话 | 切换 PTC 后发送无文件操作的消息，确定性模型回复成功；Host 为 `ptc` 且非空白会话，头部显示 PTC，只读模式标识替代选择器。 |

三处 More 的实际官方 factory 测试通过，分别核对 `cordis`、区域提示词、`whenDraftExists: append` 和菜单关闭。全套 Console 测试为 24 文件、166 项通过，原生资源构建、Vite 生产构建、TypeScript 检查通过。原 167 项中已删除不再存在的 Creator 裁剪 hash 测试。独立只读审查确认 Creator 恢复无阻塞；其后预设组件恢复由上述真实浏览器补验。

截图、脚本及证据位于本地忽略目录 `.tmp/remote-native-navigation-20261114/`。验证依赖本地确定性模型，不代表本轮复验了外部供应商或完整动态插件生成、审批、运行及新 UI 加载。预设默认值和 Coding Tools 设置仍使用既有静态 settings metadata，本轮不开放设置写入，也未验证这些远端设置变化后的同步。源码、文档及本机构建产物已更新，尚未发布或部署。
