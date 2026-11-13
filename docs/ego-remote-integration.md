# 管控台远程 Agent 浏览器

本功能在 Console 的 `/workspace.html` 原生 DSH 工作区内接入 `dsh-ego-browser@0.9.14`。浏览器进程、网页脚本和 localhost 请求在目标 Host 执行。管控台通过现有 Noise 加密 Relay 收取 CDP 实时画面，并发送观察窗操作。

此前的[隔离原型](ego-remote-proof-20261112.md)证明链路可行。本文件记录正式代码的职责和兼容边界。正式验收结果见文末，不以原型结果代替。

## 职责

Console 构建期固定 Ego 客户端版本和源文件 hash，随静态工作区发布。Host 不下发任意插件 JavaScript。网络适配只注入该 Ego factory，浏览器全局 `fetch` 和 `EventSource` 保持原状。

Host 插件负责可选能力探测、路由准入、请求校验和 watcher 所有权。Java Server 继续签发票据、维持租约并转发密文，不解释 Ego 请求，不新增业务接口或 Remote wire 版本。

普通会话、文件和终端不依赖 Ego。旧 Host 不认识 catalog、未安装 Ego、禁用插件、版本不匹配和探测失败，都不能阻止原生工作区启动。

本轮入口限于 Console 工作区。插件端通过 `/enterprise/remote/views/` 切换另一设备的页面使用本机动态 assembly，未纳入本轮 Ego 接入与验收。其它 browser-use 插件不自动继承此适配。

## 能力与路由

`GET /api/remoteClient/catalog` 通过已授权加密 link 返回以下状态。

| 状态 | 返回值 |
| --- | --- |
| 可用 | `{ego:{state:'available',version:'0.9.14',capture:'cdp'}}` |
| 不可用 | `{ego:{state:'unavailable',reason}}` |

不可用原因包括 `not-installed`、`disabled`、`version-mismatch`、`host-unsupported` 和 `probe-failed`。断线仍由工作区统一遮罩阻断，不转换为可继续操作的本机页。

Console 和 Host 共用 `plugin/packages/contracts/src/ego.ts` 路由及正文 schema。请求进入密文时使用 `/api/remoteClient/ego/<id>`，Host 将其映射到自己的固定 loopback 路径。

| id | 方法 | 目标路径 |
| --- | --- | --- |
| spaces | GET | `/api/ego/spaces` |
| stream | GET | `/api/ego/stream` |
| status | GET | `/api/ego/watch/status` |
| start | POST | `/api/ego/watch/start` |
| switch | POST | `/api/ego/watch/switch` |
| stop | POST | `/api/ego/watch/stop` |
| input | POST | `/api/ego/input` |
| navigate | POST | `/api/ego/navigate` |
| size | POST | `/api/ego/window-size` |
| close | POST | `/api/ego/close` |

方法、查询参数和 JSON 字段均按共享契约裁决，JSON 正文不超过 64 KiB。导航允许 HTTP、HTTPS 和 `about:blank`，拒绝带用户名密码的 URL。这里的导航操作控制远端浏览器，不是 Console 对任意目标提供 HTTP 代理。

登录态导入、登录桥、设置、系统弹窗和打开真实页不属于此入口。`login-extension/health` 会启动上游登录桥，即使是 GET 也拒绝。界面同步裁剪这些控件，避免出现点击后无响应的入口。

## 输入与资源所有权

原生 Ego 并发发送鼠标按下与松开。跨机原型曾实测松开先到，导致点击丢失。正式适配将输入绑定当前 link，并按 FIFO 发送。连续移动事件可合并，不能跨过鼠标按钮或键盘事件。积压和错误必须有明确终态，断线后不重放旧操作。

Host 将 watcher ID 改写到每 link 的私有命名空间。单 link 最多 8 个 watcher，停止幂等，断线回收其 watcher。流、输入队列和清理操作使用各自的生命周期，避免请求已中止却留下捕获，或者清理旧连接时影响新连接。

已经发送到本机 Ego 的写请求有独立截止时间，取消不能撤回已执行的副作用。清理等待已接收请求结束或超时，再用新的 signal 释放输入和停止 watcher。若上游迟到执行或清理请求失败，仍依赖 Ego 原生 120 秒 watcher 租约兜底，不能承诺此故障下瞬时停止捕获。控制连接失效后不再向远程页面发送画面或接受新操作。

## 已知范围

- 当前固定 Harness `0.2.1-rc.5` 和 Ego `0.9.14`。版本升级需重新核验源文件 hash、装配接缝、Host schema 和真实交互。
- 本轮支持 CDP 画面。FFmpeg、MSE 视频和音频不属于已交付路径。
- 浏览器运行中的网页可通过 Ego 观察窗查看、点击和输入，不提供本机 Edge 的网站地址或 F12。
- 不是通用网站隧道。Vite HMR、下载、上传、移动触控和其它插件需分别验证，不能由画面可见推断支持。
- Mac 是本轮目标 Host，NAS 提供 Server 和 Console。Linux 和 Windows 目标 Host 未完成真实验收。

## 正式验收

2026-11-13 已完成正式代码、独立审阅、双端构建与 NAS 部署。NAS 正式 Console 入口为 `http://home-nas:18080/`，镜像为 `owndsh-console:ego-integration-20261113-r3`，容器健康。Mac 隔离 Host 已加载新插件。线上工作区 JavaScript、assembly 清单与本机最终构建逐字节一致，Host 运行包与本机制品 hash 一致。

Console 27 项和 Plugin 26 项回归通过。独立审阅发现的活动插件禁用反馈、停止捕获后仍发送已排队输入两项问题已修复，并补充回归。独立终审未发现 P0/P1。

Edge 正式制品验收另发现两项运行问题。裁剪本机登录功能时，最终 render 残留 `chromeLogin.message`，打开面板抛出 `ReferenceError`。删除残留表达式，并用实际 Ego 注册组件和真实 React 渲染器复现后验证修复。部署后 Edge 又从磁盘缓存读取旧 `assembly.json`，继续执行旧模块。装配清单请求改用 `cache: no-store`，r3 已在同一 Edge 中加载修复后的模块。

真实 NAS→Mac API 验收已通过以下检查。

- 固定版本与 CDP 能力返回正确。
- 8 条非准入路径、方法、查询及正文请求被拒绝，后续普通业务仍可使用。
- 读取已有会话、插件目录和工作区文件成功。
- 交互终端返回 `Darwin` 和本轮测试标记，证明命令执行在目标 Mac。
- 通过密文 SSE 接收实时 CDP 帧。
- 重复停止 watcher 幂等，断开 link 后 watcher 归零。

旧 NAS Host 未升级 Ego carrier。新 Console 的真实能力探测正确降级为 `host-unsupported`，之后的会话和插件目录读取仍正常。

验收器为 [ego-remote-integration-e2e.mjs](../.audit/ego-remote-integration-e2e.mjs)。正常运行验证 Mac，设置 `OWNDSH_EGO_OLD_HOST=1` 验证旧 NAS Host。凭据只读取 ignored 的隔离测试文件。API 结果见 [正式验收证据](../.audit/ego-remote-integration-evidence.json)。

用户解锁后，Microsoft Edge 通过 NAS 正式 18080 入口连接 Mac，完成以下页面验收。

| 验收项 | 实测结果 |
| --- | --- |
| 真实模型打开网页 | Atria-Dawn 调用 Ego，在目标 Mac 打开只监听其 `127.0.0.1:18763` 的测试服务，面板显示 `FORMAL_MAC_EGO_20261113` |
| 点击 | 按钮变为“点击计数 1”，网页回执为 `FORMAL_CLICK_PASS_1` |
| 输入与按键释放 | 粘贴 `Remote-English-中文` 后退格，网页显示 `FORMAL_INPUT=Remote-English-中`，事件记录包含 `keydown Backspace` 和 `keyup Backspace` |
| 导航与刷新 | 点击网页链接到 `navigation.html`，显示 `MAC_EGO_NAV_PASS_20261113`；面板刷新产生目标 Mac 的真实 HTTP 请求；面板网址控件可返回 `formal.html` |
| 尺寸与历史 | 1:1 预设改变远端画面比例，最大化后仍持续回传；16:9 预设可恢复宽屏，历史面板显示当前测试网页并可返回实时画面 |
| 关闭与重新打开网页 | 面板关闭测试网页后，Host 页面数为 0，界面显示无活跃页；真实模型重新打开网页后，同一工作区自动恢复实时画面 |
| 文件与浏览器切换 | 文件目录及文本可读；切离浏览器 watcher 为 0，切回后为 1，画面恢复 |
| 主动断开与重连 | 断开显示明确终态，watcher 为 0；显式重连后恢复原会话和 CDP 画面 |
| 关闭远程工作区标签 | 当前 link 自动释放，watcher 为 0，管控台与其他标签保留 |
| 旧 Host | 旧 NAS Host 不显示 Ego 入口；已有会话、`host-only.txt` 和交互终端可用，终端返回 `Linux` 与 `EGO_OLD_HOST_UI_PASS` |

中文验收覆盖粘贴和退格，不代表系统输入法组合输入已验证。初次恢复验收时，Host 报告旧浏览器已断开且无活跃页；模型重新打开测试页并显式刷新工作区后恢复。此后上述交互与重连未再出现画面中断。本轮不把旧状态恢复归因为新的代码修复。

验收结束已释放本轮 link 和 watcher，NAS Server、Console、Mac Host 与测试网页服务保留。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
