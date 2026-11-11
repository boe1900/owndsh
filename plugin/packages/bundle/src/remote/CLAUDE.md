# remote/

> L2 | 父级: ../../CLAUDE.md

成员清单

workspace-runtime.ts: 产品生命周期入口，默认关闭 Host；显式开关只影响入站访问，Controller 仍可连接本人设备。官方 credentials 按平台、用户、installation、device 保存 Host 密钥，presence 退避重连，账号失效销毁全部 link；每个 Host 遵循 Server 单 link 独占约束。
secure-link.ts: Server 绑定公钥的两消息 Noise IK 与租约状态机；Host 和 Controller 各自执行单调截止时间，只有 Relay，失联先撤销准入再清理 carrier。每条 link 只服务一个官方 API Peer。
carrier-tunnel.ts: HTTP 请求/响应字节流与原生 WS 文本流的双端复用器，最多 32 通道，逐流字节信用、取消与有界文本重组；取消后丢弃在途尾帧，避免中断其他通道；路径和关联 ID 都进入密文。
dsh-carrier.ts: 官方 /connect interactions=answer 的独立 owner Peer 接缝；原生 cookie 只留远端内存，HTTP 与 mux 共用该 Peer，精确校验三个官方包的 rc.5 版本，关闭 socket 释放 Peer。
dsh-policy.ts: 精确原生 endpoint allowlist 和 WorkspaceRegistry 可信目录的 realpath 约束；文件只读，不开放 credentials、settings、安装、桌面 opener、上传或删除 API。Agent 与终端保留原生 OS 用户权限。
server-connection.ts: 双角色 WSS 状态机；等待异步 hello.ack 后才 READY，代次隔离旧 socket 回调和失败 send，撤销状态不被 close/error 覆盖。
node-socket-factory.ts: Node Host/Controller 的 Bearer Upgrade factory，限制帧大小并等待发送回调，Token 只进入请求 header。
capability-probe.ts: remote.connect 与 host.describe 的稳定 capability descriptor。
host-bridge.ts: 旧 presence 接缝的隔离接口，REVOKED 为粘性状态。
remote-runtime.ts: 早期 presence 运行时的兼容类；产品组合使用 workspace-runtime.ts 的显式 Host 开关与 secure link。
remote-audit.ts: 不含 Token 和正文的 Remote 诊断事件 sink。
transport-adapters.ts: 早期 WebRTC 与 Relay 适配器，保留协议测试；产品 workspace-runtime 不使用未验收的 P2P/TURN。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
