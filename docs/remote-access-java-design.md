<!--
[INPUT]: docs/remote-access-implementation-design.md 的 Java Server 章节、OwnDsh 现有 Spring/Netty/Redis/PostgreSQL 边界。
[OUTPUT]: 提供 Remote Java Server 的模块、Netty pipeline、状态处理和部署边界。
[POS]: OwnDsh Remote 的 Java Server 实施附录，被主实施文档引用；不拥有 Remote wire schema。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh Remote Java Server 实施设计

本文承载主实施文档的 Java Server 细节。Remote wire、HTTP、数据模型和验收顺序仍以 [remote-access-implementation-design.md](remote-access-implementation-design.md) 为准。

## 1. Java Server 详细设计

### 1.1 模块布局

P0 已落地的代码放在现有 `owndsh-enterprise` 模块，当前目录为：

```text
server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/remote/
  application/                    # ticket 输入、资格判断、幂等签发、TURN credential、lease fencing
  domain/                         # 设备快照、ticket state、稳定 Remote 错误码
  persistence/                    # ent_device + ent_remote_device_config 查询 adapter
  web/                            # P0 管理 Controller 与脱敏响应 DTO
  RemoteProtocol.java             # wire version, limits, IDs and close codes
  RemoteNettyProperties.java      # listener/TLS/Origin/frame configuration
  RemoteNettyServerLifecycle.java # Netty bind, pipeline and graceful drain
  RemoteUpgradeAuthHandler.java  # Bearer and Origin upgrade boundary
  RemoteWebSocketHandler.java    # JSON envelope and hello.ack boundary
  RemoteRedisStateStore.java      # ticket/lease/epoch/presence Lua operations
  EnterpriseRemoteConfiguration.java

R1 至 R5 的 gateway、授权接缝、Host/Web carrier 和 transport adapter 已分别落在 Java 与 plugin 目录；真实 Redis/PostgreSQL 已通过 Testcontainers 验收，Java listener 也已通过真实 JDK WebSocket 的 `ws://` 与自签名 `wss://` loopback 网络级门禁，剩余工作是生产证书链、双节点、真实 Host 联调、跨 NAT 和 coturn 验收。这些目录不能复制第二套 frame DTO，也不能把业务 RPC 放进 handler。
```

Spring MVC 负责 REST、业务授权和数据库事务；Netty 负责 Remote WebSocket 生命周期。两者通过 `RemoteAuthorizationService`、`RemotePresenceService` 和 `RemoteLeaseService` 的接口协作，不在 Netty handler 中直接写 SQL。

### 1.2 Netty pipeline

```text
HttpServerCodec
  → HttpObjectAggregator（仅 Upgrade 请求，受限大小）
  → WebSocketServerProtocolHandler(/remote/ws/v1)
  → IdleStateHandler
  → TextWebSocketFrame decoder（拒绝 binary）
  → StrictJsonControlDecoder
  → RemoteFrameValidator
  → RemoteLinkHandler
  → Outbound size/queue guard
```

每个 Channel 使用事件循环维护本地状态和发送顺序。`WriteBufferWaterMark`、`channel.isWritable()` 和有界待发送队列控制慢消费者；超过上限发送 `REMOTE_BACKPRESSURE` 后关闭，不把无界消息积压到堆内存。

`RemoteNettyServerLifecycleTest` 是 listener 的 loopback 网络级门禁。它用 JDK WebSocket 客户端完成真实 TCP、HTTP Upgrade、Bearer、Origin、`ws://`、自签名 `wss://` 和 `hello.ack` 验证。测试同时覆盖同一 JVM 内的客户端和通过 `ProcessBuilder` 启动的独立 JDK JVM 客户端，因此证明了本机进程边界上的连接行为。它仍不替代独立部署、生产证书链、浏览器、Host 插件或 WebRTC 验收。

推荐初始配置：单连接控制队列 256 帧、Relay 队列 4 MiB、单连接 pending RPC 128、全局每 device Link 4、单用户新建 Link 速率 10/min。所有值纳入配置和压测，不在业务代码散落魔法数字。

### 1.3 Server 状态与分布式部署

首版可以作为 Spring Boot 内嵌 Netty listener 运行，但必须把 Link 状态抽象为可迁移边界：

- PostgreSQL 保存设备、公钥、远控开关、审计和最终状态；
- Redis 保存 ticket、lease、presence TTL、连接路由和限流桶；
- Netty 节点保存活跃 Channel；Redis Pub/Sub 或 Streams 用于撤权广播；
- 同一 `linkId` 只允许一个 owner 节点处理；撤权事件必须幂等；
- 未来拆独立 Remote Gateway 时，REST 契约和 `RemoteGateway` 接口不变。

若部署多节点，入口负载均衡必须支持 WebSocket Upgrade 和稳定路由；不能只把 Channel 放本机内存后宣称支持水平扩展。

### 1.4 Server 处理顺序

```text
1. Upgrade：Origin / host / path / header 校验
2. hello：解析与 Upgrade 身份绑定的 role、protocol、capability
3. 设备与会话授权：tenant/user/device/status/key
4. PeerRegistry：替换同 device 的旧连接
5. connect.request：检查 ticket、目标、能力交集、link 状态
6. connect.incoming：发给 Host；Host 明确 accept/reject
7. signal：只按 linkId 和方向转发
8. transport.selected：校验 capability 和状态转换
9. secure.handshake：只转发 opaque handshake，校验 step/counter
10. relay：计数器、大小、速率、队列、lease 检查后转发
11. close：记录元数据、删除本 link 索引、保留新连接
```

### 1.5 Java 不实现的部分

不在 Java 中实现 `ice4j`、Java 原生 WebRTC、Jitsi Videobridge、业务 Noise 解密、文件系统、PTY、Harness Session。引入这些组件只会扩大 native、媒体和生命周期复杂度，当前目标不需要。
