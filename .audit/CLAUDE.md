# .audit/
> L2 | 父级: ../CLAUDE.md

成员清单

retire-plugin-inventory.todo.md: 企业插件设备库存整链路退役的实施、迁移、跨端验证和独立审查清单。
retire-plugin-inventory.tsv: 库存退役边界、兼容保留、真实验证与审查修复的无密决策记录。

ego-remote-integration.todo.md: Ego 正式接入的可选能力、跨端契约、独占实现和双机验收清单。
ego-remote-integration-e2e.mjs: 复用真实 BrowserConnection 的 NAS→Mac 能力、策略拒绝、原生业务、CDP SSE 及旧 NAS Host 降级验收，读取临时凭据并释放自己的连接。
ego-remote-integration-evidence.json: 正式 NAS→Mac API 与 Edge 交互、旧 Host 兼容、部署 hash 和最终资源释放证据，不包含凭据。

ego-remote-proof.todo.md: 基线 push 后 Ego 原生面板的隔离验证清单，比较承载结构并记录双机交互和生命周期边界。
ego-remote-proof-evidence.json: 固定 Ego 0.9.14 经 NAS Relay 的 SSE、接口拒绝、Edge 点击输入与导航、顺序输入修正、最终制品哈希和 watcher 生命周期证据，不包含凭据。

remote-disconnect.todo.md: 原生工作区主动断开和本人设备条件接管的设计、实施、竞态验证与环境保留清单。
remote-disconnect.tsv: 精确 link 断开、旧帧处理与浏览器验收的无密决策记录。
remote-disconnect-evidence.json: 断开、接管、真实 Atria-Dawn、审批、预览与交互终端的本机验收结果，记录用量未知边界与测试文件哈希，不保存凭据。
console-nas-cross-machine-evidence.json: NAS 应用制品与迁移核对、NAS Host 真实模型和右栏格式、Mac Host 文件与终端、Mac 远程 Office 及文件授权回归、Excel/CSV 只读、Edge 原生隔离 HTML 交互验收及 IAB 历史差异、审批拒绝和最终连接释放、localhost 双机标识及 DSH OOM 恢复证据，不包含 Cookie 或密钥。
console-native-workspace.todo.md: Console 原生工作区初版的实施、真实浏览器验收、构建和保留环境清单，用户要求不提交。
console-native-workspace.tsv: 静态原生 UI、协议兼容、能力裁剪和远端媒体的无密决策证据。
console-native-workspace-evidence.json: 未提交初版的真实浏览器、测试、构建和 Nginx 入口结果，明确本地模型夹具与未验收业务，不保存凭据。
console-remote-entry.todo.md: 侧栏本人设备与独立标签工作区的实施、浏览器验收、审阅和环境保留清单。
console-remote-entry.tsv: 侧栏插槽、原生品牌恢复、资源清理和管理员体验账号的无密决策记录。
console-remote-entry-evidence.json: 员工及管理员完整导航、新标签、独占与释放、窄屏布局和生产资源核对结果，明确后台挂起与业务验收边界，不保存凭据。

unified-login-local-e2e.mjs: 驱动真实本地 Server/Console 与 rc.5 Harness 新插件包，验证新鲜登录无需二次确认、已有浏览器会话仍需确认，以及验证码/首次改密、employee、拒绝和退出范围，以及原生账号菜单/设置导航/键盘/退出确认；密码从环境读取，证据输出到隔离 .tmp。
account-launcher-local-evidence.json: 底部企业账号入口与统一登录 10 项真实 rc.5 跨端验收，记录 Client/Host 构建哈希、无密 HTTP 状态及原生窗口未验证边界。
unified-login-local-evidence.json: 本地统一登录 9 项真实跨端验收结果，保留构建哈希与无密 HTTP 状态，不保存账号或凭据。

live-device.json: 早期真实 Host 设备夹具，记录不含密钥的设备标识。
live-remote-e2e.mjs: 早期 Remote 实时验收器，驱动真实 WebSocket 生命周期。
live-remote-evidence.json: 早期实时 Remote 验收结果，不保存凭据。
remote-authenticated-e2e.mjs: 已认证 Remote 回归脚本，覆盖 PKCE、设备和链路租约。
remote-authenticated-evidence.json: 已认证 Remote 回归结果，不保存凭据。
remote-authenticated-fix.todo.md: 已认证回归修复清单。
remote-browser-shell-evidence.json: 浏览器控制台 shell 入口证据。
remote-container-evidence.json: 容器内 Remote 运行证据。
remote-lan-auth-boundary.json: 本机 LAN 未认证 HTTP/WebSocket 边界证据。
remote-lan-no-tls-evidence.json: 本机无 TLS Remote 证据。
remote-lan-no-tls-run.log: 本机无 TLS 验收日志。
remote-lan-turn-evidence.json: 本机 TURN 探测结果。
remote-live-audit-final.json: 早期实时审计最终结果。
remote-live-cleanup.json: 早期实时验收清理结果。
remote-live-integration.todo.md: 实时跨端集成验收清单。
remote-local-no-tls-evidence.json: 本地无 TLS 运行证据。
remote-local-no-tls-run.log: 本地无 TLS 运行日志。
remote-nas-auth-boundary-initial-failure.json: NAS 未认证边界首次失败及修正记录。
remote-nas-auth-boundary.json: NAS 未认证 HTTP/WebSocket 边界最终证据。
remote-nas-backup-manifest.json: NAS 回滚快照文件清单与非密文件哈希。
remote-nas-deploy.todo.md: NAS 替换部署阶段清单与范围边界。
remote-nas-deploy.tsv: NAS 部署决策、分叉、证据和结果日志。
remote-nas-deployment-snapshot.json: NAS 镜像、架构、健康、端口、存储和 Compose 快照。
remote-nas-e2e.mjs: NAS 跨机器认证、Relay、Lease、TURN 和撤权验收器。
remote-nas-evidence.json: NAS 跨机器验收无密结果。
remote-p0.todo.md: P0 交付验收清单。
remote-r1-r5.todo.md: R1 至 R5 交付验收清单。
remote-r1-r5.tsv: R1 至 R5 决策与证据日志。
remote-workspace-investigation.todo.md: 上游插件跨机器工作区发现、操作与 OwnDsh 缺口的只读调查清单。
remote-dsh-workspace.todo.md: 插件 DSH 远程工作区首个业务闭环的设计、实施与验收清单。
remote-dsh-workspace.tsv: DSH 远程工作区实施的决策与证据记录，不包含凭据或业务正文。
remote-workspace-mount-evidence.json: 官方 npm rc.5 原生页面在独立 mount 启动和基础 Storage 隔离的同机架构验证，不代表跨机业务验收。
remote-workspace-local-e2e.mjs: 两个真实 npm rc.5 Harness 的员工登录、入站开关、原生整页及 Session/File/Terminal 业务联调，可选择隔离本机服务或 NAS 部署；凭据只读取临时文件，不触碰日常 profile。
remote-workspace-local-evidence.json: 双真实 Harness 的业务、断线/刷新/重连与页面隔离验收结果，包含实际包哈希、协议哈希和本地模型夹具/未验收范围声明。
remote-workspace-storage-e2e.mjs: 真实 Chrome 的远端 Storage façade 方法、属性、事件、枚举、clear、刷新与多目标隔离验收。
remote-workspace-storage-evidence.json: Chrome Storage 六项无密验收结果，不代表业务或传输验收。
remote-workspace-nas.todo.md: Mac 与 NAS 双物理机业务验收和保留环境清单。
remote-workspace-nas.tsv: NAS 更新、运行环境、双机业务验收与保留环境的决策和证据，不含凭据。
remote-workspace-nas-deployment.json: NAS 同提交 ARM64 镜像、健康检查、备份文件清单和已校验 Node 运行时证据。
remote-workspace-nas-evidence.json: Mac 与真实 ARM64 NAS 的 14 项业务验收、最终 bundle/协议哈希、保留状态与未验证边界。
remote-stability-evidence.json: 原 Edge NAS→Mac 反复重连修复的无密记录，包含真实制品校验、三次 view 初始化、同 view 连续采样、双端续租、自动回归与诊断清理边界。
remote-workspace-nas-support.mjs: 共用业务验收器的 NAS Host、SSH 回环管理访问、测试文件和无密拓扑适配；按用户要求保留 NAS 容器，失败仅清理本轮转发。
remote-workspace-nas-runtime.Dockerfile: NAS 调试镜像补充真实非 root Linux 账号和 bash，Node/Harness 由验收器挂载，Java 服务不在该容器启动。
ship-main.todo.md: 直接推送 main 的发布检查清单与跳过项。
remote-server-after-auth-fix.log: 认证修复后的本地 Server 日志。
remote-server-lan.log: 本地 LAN Server 日志。
remote-server-lan.pid: 本地 LAN Server 进程标识。
remote-server-rerun.log: 本地 Server 重跑日志。
remote-server-vite-origin.log: Vite Origin 代理日志。
remote-server.log: 早期本地 Server 日志。
remote-turn-evidence.json: 早期 TURN 验收结果。
remote-vite-lan.log: Vite LAN 运行日志。
remote-vite-lan.pid: Vite LAN 进程标识。
remote-vite-proxy-evidence.json: Vite Remote WebSocket 代理证据。
turn-allocate.py: 原生 UDP TURN Allocate 与释放探针，只从环境读取短时凭据。

法则: 审计脚本生成无密证据；临时凭据只读取未跟踪的隔离环境，不写入受版本管理的证据。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
