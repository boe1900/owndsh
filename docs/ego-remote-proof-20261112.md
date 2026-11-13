# Ego 原生面板远程承载验证

2026-11-12，基线 `a2b435474` 已提交并 push 到 `origin/main`。本轮新增代码只在 `.tmp/ego-remote-proof/source` 的隔离副本，尚未合入产品。

## 当前结论

**方案可行。** 2026-11-13 在 Edge 完成 NAS 18081 管控台到 Mac 隔离 Host 的实际界面验收。原生 Agent 浏览器面板可显示实时画面、点击、输入、导航和刷新。切换右栏、主动断开、重新连接和关闭活动页面的 watcher 生命周期均通过。

网页由 Mac 的 Ego Chromium 访问和执行。Console 接收画面并发送输入意图，因此可访问只监听 Mac `127.0.0.1` 的开发服务。本方案不要求将该服务发布到 NAS，也没有实现通用网站隧道。它不提供任意第三方浏览器插件的自动兼容。

这是已完成可行性验证的隔离原型，未合入产品。验证覆盖固定 Ego 0.9.14、Harness 0.2.1-rc.5 和 CDP 路径。正式接入的剩余边界列在文末。

## 结构选择

两个独立候选核查了 iframe 与固定 bundle 的局部网络适配。本轮选择后者。

Console 构建固定 `dsh-ego-browser@0.9.14`，校验客户端 SHA-256 后，只在 ModuleLoader factory 内绑定专用 `fetch/EventSource`。保留原版面板、鼠标坐标、键盘和输入法、原生 sidebar slot 与官方 React 单例。浏览器不会执行目标 Host 提供的任意 JavaScript。

共享路由表将 Ego 请求映射到密文内的 `/api/remoteClient/ego/<routeId>`，Host 将它反映射到固定 loopback 端点。Java Relay 和 Remote wire 保持原实现。使用 `eventsource@5.1.5` 解析命名 SSE 事件，设置 4 MiB 缓冲上限，不另写 SSE 协议解析器。

Host 检查 Loader 的 enabled/active 状态、pluginManager 安装版本和本地包版本。只开放观察窗的 spaces、stream、watch status/start/switch/stop、video、input、navigate、window-size 和 close。video 仅接收单个 generation 参数。POST body 限制 64 KiB。

设置写入、登录态导入与全部 login-extension 路由都被拒绝。特别是原版面板自动发起的 `login-extension/health`，该 GET 实际会启动登录桥，因此也不开放。固定原面板中的受限控件尚未做产品化隐藏。

每条 link 将 watcher clientId 改写为私有命名空间，最多跟踪八个身份。即使 stop 请求在途中被取消，link 结束时仍会再次清理这些 watcher。Controller link 结束时同步关闭局部 EventSource，禁止其自动建立新 link。

输入是有顺序的命令流。适配器为每条 link 保留一个 FIFO，前一输入收到响应头后才发送后一输入，最多排队 64 项。执行每项前检查 link 是否已终止，旧 link 的输入不进入重连后的 link。帧和普通查询不进入此队列。

## 验证中发现的输入问题

原版 `sendInput` 对按下、松开和键盘事件分别发起并行 HTTP 请求。最初实测出现点击无效和画面停留在旧状态，诊断记录中同一次点击的 `mouseReleased` 比 `mousePressed` 先返回。并行 HTTP 不保证输入顺序，不能直接沿用为远程输入通道。

原型改用顺序队列后，测试页实际记录 `mousedown → mouseup → click`，并显示点击成功标记。随后输入框实际记录 `input=EDGE_EGO_20261113_INPUT`。去掉诊断显示、重新构建部署并重连后，再次点击两次、输入 `EDGE_EGO_FINAL_20261113`，页面同步显示 `MAC_BROWSER_CLICK_PASS_2` 和完整输入值。此修正不修改 Java Relay 或帧传输。

该问题记为 `EGO-P01`，在隔离原型中已修正。高频鼠标移动的合并、队列满后的释放语义，以及失败反馈仍属于正式输入通道的产品化要求，当前队列不构成这些场景的验收。

## 实测记录

| 检查 | 结果 |
| --- | --- |
| 固定官方 UI + Ego assembly | 构建通过，52 个客户端模块、150 个资源，两个 Ego 资源入口均完成局部注入 |
| Console TypeScript、生产构建 | 最终无诊断版本通过 |
| 插件 TypeScript、Host bundle 构建 | 通过 |
| 既有 carrier/native/network 边界回归 | 3 个文件、15 项测试通过 |
| 最终 Console 回归 | browser-link、native-transport、native-image 共 3 个文件、9 项测试通过 |
| Host catalog | 正确报告 Ego 0.9.14 active |
| 真实模型 | Atria-Dawn 经 NAS 发起 session/prompt，Ego 在 Mac 打开 `http://127.0.0.1:18763/` |
| 实际加密 SSE | 200，命名事件正确；最终运行制品的局部 EventSource 收到 3 帧，累计 98672 字节 base64 数据，画面为 1280 × 813 |
| 捕获 backend | CDP；未验证 ffmpeg/MSE 路径 |
| 错 method、未知 query、重复 generation | 拒绝 |
| 登录桥、设置写入、原始 Ego 路径绕过 | 拒绝 |
| 拒绝和取消 SSE 后读取原生插件目录 | 仍可用，198 条 Host entry |
| 断开 link | EventSource CLOSED，Host watcher 数归零 |
| Edge 原生面板与实时画面 | 通过，读取 Mac 专用标记 `MAC_EGO_BROWSER_20261112` |
| Edge 点击与文字输入 | 通过，最终无诊断版本显示点击计数 2 和 `EDGE_EGO_FINAL_20261113` |
| Edge 导航 | 通过，打开 Mac `/navigation.html`，显示 `MAC_EGO_NAV_PASS_20261113` |
| Edge 刷新 | 通过，实际加载更新后的测试页面，计数重置并出现输入事件记录 |
| 右栏切换 | 切走时 watcher=0、idle，切回时 watcher=1、streaming |
| 终端回归 | 原生终端输出 `EGO_REMOTE_TERMINAL_PASS_20261113` 和 `Darwin`，测试 shell 已退出 |
| 会话回归 | 原有真实 Atria-Dawn 会话和消息正常读取；本轮未重复发起额外模型请求 |
| 主动断开 | 页面进入明确断开状态，操作区移除，watcher=0、idle |
| 重新连接 | 原生会话和 Ego 面板恢复，watcher=1、streaming，最终点击输入再次通过 |
| 关闭活动页面 | watcher=0、idle，关闭的是本次验收标签，服务继续保留 |

图像保存于 `.tmp/ego-remote-proof/carrier-frame.jpg`，画面标记为 `MAC_EGO_BROWSER_20261112`。机器可读证据位于同目录的 `api-evidence.json` 和 `stream-evidence.json`。它们不包含 Cookie 或模型密钥。

Edge 界面证据位于 `.tmp/ego-remote-proof/edge-panel-final.jpg`、`edge-panel-navigation.jpg` 和 `edge-panel-terminal.jpg`。这些裁剪只保留工作区右栏。生命周期证据位于 `ui-lifecycle.json`，汇总结果见 `.audit/ego-remote-proof-evidence.json`。

## 保留环境与复验

- 测试 Console：`http://home-nas:18081/`。
- 测试工作区：`http://home-nas:18081/workspace.html?deviceId=2120400737015017474`。
- Mac 隔离 Host：`http://127.0.0.1:49759/`，使用原测试 profile，已安装 Ego 0.9.14。
- Mac 测试网页：`http://127.0.0.1:18763/`，仅监听 Mac loopback。
- 稳定 Console：`http://home-nas:18080/`，本轮未替换。

2026-11-13 最终复查，NAS 18081 健康检查为 UP，稳定 Console 与 Mac 测试网页均返回 200，Ego 保留测试网页且 watcher 为零。原型 18081 没有注册登录回调，直接登录会在 authorize 阶段返回 400。先从稳定的 18080 入口正常登录，同主机 Cookie 可供 18081 复用，不需要修改 Server 的登录回调配置。本轮已获用户验证码操作授权并完成正常登录。

测试容器为 `owndsh-console-ego-proof`，与既有 Server 共用 NAS backend 网络。18081 的 Nginx 仅将准确的测试 Origin 映射到 Server 已配置的 18080 Origin；其它 Origin 原样保留并接受既有校验。该映射只存在测试容器，不是产品配置变更。Nginx 需要 `/tmp` tmpfs 才能以 uid 101 正常运行。

隔离源码在 `.tmp/ego-remote-proof/source`。运行 Host 的更新前文件备份在 `.tmp/ego-remote-proof/backup`。恢复时先确认 link 空闲，将备份的 `index.js` 与 source map 放回隔离 profile 后重启。不要执行 pnpm 重装来回滚，旧 tgz 可能覆盖先前的运行修复。

非界面复验命令在仓库根目录运行：

```sh
node .tmp/ego-remote-proof/probe.mjs
EGO_PROOF_FRAMES=1 node .tmp/ego-remote-proof/probe.mjs
```

脚本使用的浏览器会话 Cookie 已过期，运行前需通过正常登录取得新的脚本测试会话。Edge 当前会话已恢复，浏览器与脚本会话分别管理。第二条要求专用 Ego 浏览器已打开测试网页。需要恢复网页时，使用 `EGO_PROOF_PROMPT=1` 的同一脚本，经用户已授权的真实模型调用 Ego 导航。临时私有凭据文件不进入 Git。

## 正式接入的边界

建议采用固定受信任客户端、声明式路由和既有加密 carrier 的结构。与任意插件 iframe 相比，当前结构保留原生 sidebar 交互，但固定版本需要显式升级和重验。

| 编号 | 正式接入要求 |
| --- | --- |
| EGO-P02 | Ego 为可选能力。Host 未安装、被禁用或版本不匹配时，普通远程工作区继续可用。当前原型的启动 catalog 检查会阻止整个工作区，不可直接合入。 |
| EGO-P03 | 拒绝的登录导入、登录桥和设置控件应隐藏或给出明确原因。原型保留原控件，但 Host 拒绝相关请求。 |
| EGO-P04 | 输入队列应处理鼠标移动合并、满队列、失败后的按键释放、输入法和代理延迟。原型只验证正常点击和粘贴输入。 |
| EGO-P05 | 补充权限撤销中的在途流、禁用插件、Host 重启、长时间运行和升级门禁验收。 |
| EGO-P06 | ffmpeg/MSE、Linux Host 和 Windows Host 尚未验收。本次目标 Host 是 Mac，NAS 承载 Server 和 Console。 |

开发服务的请求、脚本和 WebSocket 均由远端浏览器处理，因此不需要为这些网页逐一做地址重写。但这不等于本轮验证了任意开发框架、HMR、音频、下载、DevTools 或移动端触控。

Model the Domain 决定双端共享精确路由表，并将输入建模为 FIFO。Fix Root Causes 决定检查实际输入回执和页面事件，修正顺序问题。Prove It Works 决定使用 Edge 实际点击、输入和导航，并在去掉诊断后的最终制品上复验。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
