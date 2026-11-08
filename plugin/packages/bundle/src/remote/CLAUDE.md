# remote/

> L2 | 父级: ../CLAUDE.md

成员清单

capability-probe.ts: 首期 capability descriptor，只声明 remote.connect 与 host.describe。
host-bridge.ts: Host 登录 presence 和 capability 的隔离接口；REVOKED 为粘性状态，只能由显式恢复清除，不依赖 Typert 业务 provider。
remote-audit.ts: 不含 Token/正文的 Remote 诊断事件 sink。
node-socket-factory.ts: Node Host 的 Bearer WSS Upgrade factory，Token 只进入请求 header。
remote-runtime.ts: 平台状态驱动 presence 生命周期；收到设备撤权事件时调用平台凭据所有者、关闭 carrier，并阻止普通 SIGNED_OUT 覆盖。
server-connection.ts: 可测试的 WSS connection state machine、严格 control frame parser 和一次性设备撤权事件；REVOKED 连接不会被 close/error 降级。
transport-adapters.ts: WebRTC DataChannel 与有界 Relay transport adapter，共用 ticket、counter 和 linkId。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
