<!--
[INPUT]: docs/remote-access-implementation-design.md 的 Java Server 章节、OwnDsh 现有 Spring/Netty/Redis/PostgreSQL 边界。
[OUTPUT]: 提供 Remote Java Server 的模块、实际 Netty pipeline、Channel 发送预算与在途语义、状态处理和部署边界。
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

`RemoteNettyServerLifecycle` 当前装配如下。

```text
可选 TLS SslHandler
  → HttpServerCodec
  → HttpObjectAggregator（仅 Upgrade 请求，受限大小）
  → RemoteUpgradeAuthHandler（Bearer/Cookie、Origin）
  → WebSocketServerProtocolHandler(/remote/ws/v1)
  → IdleStateHandler
  → RemoteWebSocketHandler（文本大小、JSON envelope、协议字段）
  → RemoteGateway（授权、Link 状态、发送预算）
```

Gateway 的 monitor 串行处理 Link 和发送准入。每个 Channel attribute 独立保存未完成写入的字节、帧数和 OPEN/STOPPED/CLOSE_SENT 状态。所有 Gateway JSON 共用一个发送入口，按实际序列化 UTF-8 字节加 10 字节 WebSocket header 预留预算，上限为 4 MiB 和 256 帧，恰好上限可接纳。预算在 `writeAndFlush` 前预留，因此包含目标 eventloop 尚未执行的任务。Netty 维护原有出站顺序，不新增 FIFO，不因临时 `isWritable=false` 关闭，也不提高水位。

每次 write promise 完成后回收对应预算，包括成功、失败和取消；关闭不直接清零。完成监听器使用 `ImmediateEventExecutor`，目标 loop 拒绝提交时也能由当前线程结算。已提交 frame 归 Netty；尚未提交的超限 frame 由 Gateway 释放。计费约束逻辑积压，不代表整个 JVM、TLS 和 TCP 的总内存上限。

超限或 write failure 先停止故障 Channel 的新准入，清理它当前所属的 Link/lease，并给健康对端原有 `ENT_REMOTE_UNAVAILABLE` 通知。故障 carrier 尝试一次 4503 WebSocket Close；该固定小终止帧是普通预算外唯一名额。Close 写入完成即关闭，并安排 1 秒强制关闭。调度被拒绝时直接尝试关闭。截止时间依赖 eventloop 正常推进，不能覆盖线程被阻塞的墙钟时间，对端不读取时也不保证收到 4503。撤权的 4003、协议错误的 4400 和替换的 1000 保留，旧 Channel 回调不操作替换后的 Peer。

身份、公钥、lease 和序号仍在提交前裁决。已交给 Netty 的密文属于在途数据，撤权后不再接纳新帧，不承诺撤回已进入 TCP 的字节。普通 Link 关闭通知仍受预算限制，健康 Host carrier 可继续复用。租约广播在任何可能同步失败的写入前捕获两端，Link 被移除后停止剩余 ACK，也不重建 deadline。

`RemoteNettyServerLifecycleTest` 是 listener 的 loopback 网络级门禁。它用 JDK WebSocket 客户端完成真实 TCP、HTTP Upgrade、Bearer、Origin、`ws://`、自签名 `wss://` 和 `hello.ack` 验证。测试同时覆盖同一 JVM 内的客户端和通过 `ProcessBuilder` 启动的独立 JDK JVM 客户端，因此证明了本机进程边界上的连接行为。它仍不替代独立部署、生产证书链、浏览器、Host 插件或 WebRTC 验收。

发送回归由 `RemoteGatewayOutboundTest` 验证实际 UTF-8/帧数边界、future 与 ByteBuf 生命周期、撤权和同步失败重入；`RemoteGatewayEventLoopTest` 用两个真实 eventloop/latch 验证目标未执行时的预算，以及 executor 拒绝后的回收。当前每 Peer 只允许一个活动 Link。单连接 pending RPC 和新建 Link 速率不由此发送预算实现，后续如需调整，须独立确定端点责任和压测依据。

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
