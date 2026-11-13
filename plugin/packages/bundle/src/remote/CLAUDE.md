# remote/

> L2 | 父级: ../CLAUDE.md

成员清单

workspace-runtime.ts: 产品生命周期入口，默认关闭 Host；显式开关只影响入站访问，Controller 仍可连接本人设备。本人目录按游标读取最多 500 台，拒绝循环或截断；官方 credentials 按平台、用户、installation、device 保存 Host 密钥，presence 退避重连，账号失效销毁全部 link；每个 Host 遵循 Server 单 link 独占约束，Controller 保留建链拒绝错误码供本机边界投影。
secure-link.ts: 兼容导出 remote-core 的共享实现；Server 绑定公钥的两消息 Noise IK 与租约状态机；Host 和 Controller 各自执行单调截止时间，只有 Relay，失联先撤销准入再清理 carrier。每条 link 只服务一个官方 API Peer。
carrier-tunnel.ts: 兼容导出 remote-core 的共享实现；HTTP 请求/响应字节流与原生 WS 文本流的双端复用器，最多 32 通道，逐流字节信用、取消与有界文本重组；取消后丢弃在途尾帧，避免中断其他通道；路径和关联 ID 都进入密文。
dsh-carrier.ts: 官方 /connect interactions=answer 的独立 owner Peer 接缝，额外承接可选 Ego catalog 与封闭路由；原生 cookie 只留远端内存，HTTP 与 mux 共用该 Peer；慢消费仍持续读取 WS 心跳，文本队列累计超过 4 MiB 关闭；文件与 Office 准入解析完整 RPC envelope 并绑定 URL 方法，普通端点拒绝只结束对应流，取消立即回收并丢弃在途尾帧，关闭 socket 释放 Peer；精确校验三个官方包的 rc.5 版本。
ego-policy.ts: 可选 Ego 的三方版本/Loader 准入、每 link watcher 命名空间及8项上限，关闭等待已收 POST 后回收输入/watchers；活动流每2秒复核插件状态，禁用或卸载只中止 Ego 能力。
dsh-policy.ts: 精确原生 workspace/session/job/terminal 与 officeToPdf generation/render allowlist；Office 转换只按会话和源路径执行 WorkspaceRegistry realpath 约束，不借用普通文件的 baseFile 解析语义；内置插件目录经 pluginInventory/list 只读访问目标 Host，不开放 credentials、settings、插件管理、桌面 opener、上传或删除 API。Agent 与终端保留原生 OS 用户权限。
server-connection.ts: 双角色 WSS 状态机；等待异步 hello.ack 后才 READY，代次隔离旧 socket 回调和失败 send，撤销状态不被 close/error 覆盖。
node-socket-factory.ts: Node Host/Controller 的 Bearer Upgrade factory，声明平台 HTTP(S) Origin，限制帧大小并等待发送回调，Token 只进入请求 header。
capability-probe.ts: remote.connect 与 host.describe 的稳定 capability descriptor。
host-bridge.ts: 旧 presence 接缝的隔离接口，REVOKED 为粘性状态。
remote-runtime.ts: 早期 presence 运行时的兼容类；产品组合使用 workspace-runtime.ts 的显式 Host 开关与 secure link。
remote-audit.ts: 不含 Token 和正文的 Remote 诊断事件 sink。
transport-adapters.ts: 早期 WebRTC 与 Relay 适配器，保留协议测试；产品 workspace-runtime 不使用未验收的 P2P/TURN。

view-bootstrap.ts: 远端 document 的前置引导，按稳定设备 authority 隔离浏览器持久化与 storage event，不修改本机页或 Storage 原型。
view-registry.ts: 每个远端 document 的固定目标、账号边界和独立连接所有权，刷新产生新 view，重连失败保留已断开的目标供重试，按心跳有界回收失联页面。
local-remote-api.ts: 官方 owner admission 与回环同源双重门禁下的设备选择、Host 开关、view 创建和显式重连；占用只投影固定 ENT_REMOTE_BUSY/409，其余未知故障继续脱敏，不接受代理地址或凭据。
view-mount.ts: 本机 UI assembly 与远端业务流量的显式分流，逐 view 挂载 HTTP 和原生 mux，不提供未知路径本机回退。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
