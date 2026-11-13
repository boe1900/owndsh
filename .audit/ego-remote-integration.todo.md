# Ego 远程浏览器正式接入

- [x] `how` over the affected subsystem.
  - 现有 Console 固定 assembly 供应 UI，RemoteDshLink 供应加密业务；Host 独立 owner Peer 和 allowlist 掌握执行权限。原型仅增加局部网络适配，Java Relay 无业务变化。
- [x] `architect` for parallel design exploration.
  - 复用前轮 ego_design_isolation / ego_design_registry 设计和双机原型结果。选固定版本可选插件及局部适配，通用插件注册平台暂不引入。
- [x] Write the throughput checkpoint as four todo items.
  - [x] **Blocking first steps.** 冻结路由、可选能力与断线不重放契约，复查现有原型。
  - [x] **Independent workstreams.** 唯一实现者负责 Console/contracts/Host；主代理负责双机环境、审阅与验收记录。
  - [x] **Shared mutable state.** 实现使用独立 worktree；主代理不写其源码，不在实现者 worktree 并行运行套件。
  - [x] **Smallest safe decomposition.** 跨端路由和版本门禁代码紧耦合，单 owner 维护；验收者独立。
- [x] Delegate code-writing to a subagent using your configured feature model.
  - 独立 worktree 实现完成后导入主 checkout，主代理修复独立审阅的捕获停止与禁用反馈问题。
- [x] Verify on the matching surface.
- [x] Rebase into small, ordered commits. Stack follow-ups.
  - 用户已授权直接提交 main；依赖构建修正和 Ego 接入分别提交，无需 rebase。
- [ ] If the design is contested, `interrogate` before shipping.
  - skip: 已有两套设计与原型验证，没有未决设计争议；实现仍需独立审阅。
- [ ] Run **Opening a PR**.
  - skip: 用户要求直接 main，不创建 PR。

## 契约

以固定路由注册表组织 Ego 请求；catalog 的状态决定是否加载 Ego UI，旧 Host/未安装/禁用/版本不符均保留普通工作区。输入是绑定 link 的有界 FIFO，合并连续移动事件，失败关闭该输入代次并提示，断线不重放。Host 对 JSON、URL、watcher owner 和版本作边界校验，关闭与撤权回收 watcher。Console 只执行构建期固定 Ego 代码，不加载远端任意插件代码。

## Edge 正式制品回归

- [x] Edge 打开 Agent 浏览器复现空白，控制台为 `ReferenceError: chromeLogin is not defined`。
- [x] `scripts/ego-client.test.mjs` 渲染实际注册面板，修复前同错误失败；删除登录提示残留引用后通过。
- [x] 本次修正只移除已裁剪功能的渲染引用，不改接口、权限或资源生命周期，采用 focused-fix，未重开架构设计。
- [x] 最终 Console 7 文件 27 项通过，生产构建通过。测试在生成结束后串行执行，避免 generated API 目录被构建重建干扰。
- [x] Edge Network 实测 `assembly.json` 从 disk cache 返回旧资源表。装配清单改为 `cache: no-store`，已完成构建检查，防止更新后继续执行旧 UI。
- [x] NAS 更新 r3 修复制品并完成同面板点击、输入、导航、切栏和重连验收。

- [x] 可选能力及受限 UI。
- [x] Host 路由和 watcher 生命周期。
- [x] 输入保序、积压、异常与终止。
- [x] 实质性回归、生产构建与独立审阅。
  - Console 27 项、Plugin 26 项通过，双端生产构建通过；独立终审无 P0/P1，两项 P2 均已修复并有回归。
  - NAS 正式 18080 Console 已切新镜像并健康，在线静态制品与本机最终构建 hash 一致。
  - NAS→Mac API 8 项通过，含 8 条策略拒绝、会话、文件、真实 Mac 终端、实时画面、停止幂等与断链回收。
  - 旧 NAS Host 能力降级与后续普通会话读取 2 项通过。
- [x] NAS→Mac Edge 正常/旧 Host 不可用/切栏/重连验收。
  - Atria-Dawn 重新打开 Mac loopback 测试页；点击产生 `FORMAL_CLICK_PASS_1`，中英文粘贴后退格得到 `Remote-English-中`，同时观察到 Backspace keydown/keyup。
  - 网页链接导航与面板网址导航均成功；面板刷新在 Mac 测试服务产生真实请求。
  - 尺寸预设、最大化及历史控件可操作；关闭网页后 Host 页面数为 0，面板显示空状态，模型重新打开后自动恢复画面，无需整页刷新。
  - 文件与浏览器切换时 watcher 0/1；主动断开及关闭本轮标签后为 0，显式重连恢复 CDP。
  - 旧 NAS Host 无 Ego 入口；已有会话和 `host-only.txt` 可读，终端返回 Linux 与 `EGO_OLD_HOST_UI_PASS` 后正常 exit 0。
- [x] L3/L2/L1 与产品文档同步，释放自己的 link 并保留服务。
  - 正式验收证据已合并部署、API、Edge、旧 Host 与回归结果；2026-11-13 14:15 最终核实 Mac watcher 为 0，两台设备的 linkId 均为 null。
  - 只关闭本轮测试工作区标签；NAS Server、Console、Mac Host 和测试网页服务保留。验收后用户已授权提交和 push。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
