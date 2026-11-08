# remote/

> L2 | 父级: ../CLAUDE.md

成员清单

EnterpriseRemoteConfiguration.java: Remote Netty listener、WSS pipeline 与配置属性的装配边界，默认关闭并由 lifecycle 优雅停止。
application/: Remote 控制面编排、ticket 输入校验和 lease fencing。
domain/: Remote 设备摘要、ticket 状态和稳定错误码。
web/: Remote P0 管理 API 与脱敏响应 DTO。
persistence/: Remote 设备快照的 PostgreSQL 读取端口与 adapter。
RemoteNettyProperties.java: Remote listener 地址、端口、TLS、frame 上限和 drain 配置，启动时校验。
RemoteNettyServerLifecycle.java: 内嵌 Netty server 的 bind/close 生命周期；只承载 WebSocket carrier，不实现业务 RPC。
RemoteWebSocketHandler.java: WebSocket 文本 frame 的大小、JSON envelope 和 hello.ack 边界校验，不解密 Noise 或 Typert 内容。
RemoteUpgradeAuthHandler.java: Upgrade 入口的 Bearer header/Origin 边界校验，凭据验证由后续 Sa-Token adapter 接入。
RemoteProtocol.java: Java 侧 Remote v1 常量、ID 正则和稳定 close code，与 contracts/remote 同构。
RemoteRedisStateStore.java: ticket 一次性消费、lease compare-and-renew、revoke epoch 和 presence TTL Lua 原子操作。
RemoteGatewayAuthorizer.java: carrier 到 OwnDsh ticket、lease 和 presence 事实的授权端口；默认实现拒绝未接入身份的连接。
RemoteGateway.java: Peer/Link 状态机、control 路由、opaque relay、counter、连接替换和关闭语义。
RemotePeerIdentity.java: Upgrade 后的租户、成员与终端身份值对象，不携带 Token。
RemotePeerAuthenticator.java: 平台 Token 到 RemotePeerIdentity 的认证端口。
RemoteControlGatewayAuthorizer.java: RemoteControlService 到 Gateway 的真实授权 adapter。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
