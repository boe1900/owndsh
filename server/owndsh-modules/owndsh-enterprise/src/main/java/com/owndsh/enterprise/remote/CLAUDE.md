# remote/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseRemoteConfiguration.java: HTTP/Netty 共享 Gateway、Remote listener、WSS pipeline 与配置属性的装配边界，默认关闭并由 lifecycle 优雅停止。
application/: Remote 控制面编排、ticket 输入校验和 lease fencing。
domain/: Remote 设备摘要、ticket 状态和稳定错误码。
web/: 管理诊断、Harness 员工与 Console 浏览器本人设备 API；本人 ticket 携带已 pin 的 Host 公钥，浏览器不要求管理角色。
persistence/: Remote 设备快照的 PostgreSQL 读取端口与 adapter。
RemoteNettyProperties.java: Remote listener 地址、端口、TLS、frame 上限和 drain 配置，启动时校验。
RemoteNettyServerLifecycle.java: 内嵌 Netty server 的 bind/close 生命周期；只承载 WebSocket carrier，不实现业务 RPC。
RemoteWebSocketHandler.java: WebSocket 文本 frame 的大小、JSON envelope 和 hello.ack 边界校验，不解密 Noise 或 Typert 内容。
RemoteUpgradeAuthHandler.java: Upgrade 的 Bearer/Cookie 与 Origin 校验，保存仅内存的会话重验回调，供后续帧与定时检查识别登出。
RemoteProtocol.java: Java Remote v1 常量、ID/close code 与规范无填充 32 字节公钥校验，与 contracts/remote 同构。
RemoteRedisStateStore.java: ticket/link 原子匹配消费与源安装绑定，lease 续租同步延长 link/consumed TTL，撤权删除三者并保留短期 epoch。
RemoteGatewayAuthorizer.java: carrier 到 OwnDsh ticket、lease、准确 link 撤销和 presence 事实的授权端口；默认实现拒绝未接入身份的连接。
RemoteGateway.java: 共享 HTTP/Netty 的连接快照、expectedLinkId CAS 撤销与 accept/relay/握手双消息/lease 状态机，迟到的已删除 link 帧静默丢弃以免误伤替代连接，当前授权重验、双端 ACK 与到期清理；每 Channel 提交前预留 4 MiB/256 帧预算，write future 回收，超限或发送失败只关闭故障 carrier，Close 至多一次并有 1 秒截止时间。
RemotePeerIdentity.java: Upgrade 后的租户、成员与终端身份值对象，不携带 Token。
RemotePeerAuthenticator.java: 平台 Token 到 RemotePeerIdentity 的认证端口。
RemoteControlGatewayAuthorizer.java: RemoteControlService 到 Gateway 的真实授权 adapter。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
