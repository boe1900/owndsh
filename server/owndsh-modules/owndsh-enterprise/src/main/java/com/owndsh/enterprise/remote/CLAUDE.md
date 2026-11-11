# remote/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseRemoteConfiguration.java: Remote Netty listener、WSS pipeline 与配置属性的装配边界，默认关闭并由 lifecycle 优雅停止。
application/: Remote 控制面编排、ticket 输入校验和 lease fencing。
domain/: Remote 设备摘要、ticket 状态和稳定错误码。
web/: 管理诊断和员工本人设备 API，员工 ticket 额外携带已 pin 的 Host 公钥。
persistence/: Remote 设备快照的 PostgreSQL 读取端口与 adapter。
RemoteNettyProperties.java: Remote listener 地址、端口、TLS、frame 上限和 drain 配置，启动时校验。
RemoteNettyServerLifecycle.java: 内嵌 Netty server 的 bind/close 生命周期；只承载 WebSocket carrier，不实现业务 RPC。
RemoteWebSocketHandler.java: WebSocket 文本 frame 的大小、JSON envelope 和 hello.ack 边界校验，不解密 Noise 或 Typert 内容。
RemoteUpgradeAuthHandler.java: Upgrade 的 Bearer/Cookie 与 Origin 校验，保存仅内存的会话重验回调，供后续帧与定时检查识别登出。
RemoteProtocol.java: Java Remote v1 常量、ID/close code 与规范无填充 32 字节公钥校验，与 contracts/remote 同构。
RemoteRedisStateStore.java: ticket/link 原子匹配消费与源安装绑定，lease 续租同步延长 link/consumed TTL，撤权删除三者并保留短期 epoch。
RemoteGatewayAuthorizer.java: carrier 到 OwnDsh ticket、lease 和 presence 事实的授权端口；默认实现拒绝未接入身份的连接。
RemoteGateway.java: accept/relay/握手双消息/lease 状态机，当前会话与设备重验、双端租约 ACK、定时到期与 Link 级关闭；Peer 撤销才关闭 carrier。
RemotePeerIdentity.java: Upgrade 后的租户、成员与终端身份值对象，不携带 Token。
RemotePeerAuthenticator.java: 平台 Token 到 RemotePeerIdentity 的认证端口。
RemoteControlGatewayAuthorizer.java: RemoteControlService 到 Gateway 的真实授权 adapter。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
