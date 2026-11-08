# remote/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

RemoteDeviceSnapshotTest.java: 验证设备状态、远控开关和 presence TTL 的连接资格不变量。
RemoteTicketRequestTest.java: 验证控制端 ID、公钥和 capability 输入边界。
RemoteWebSocketHandlerTest.java: 验证 Java carrier 的 hello、协议字段、Cookie Upgrade 和关闭码边界。
RemoteGatewayTest.java: 验证 Peer/Link 建链、signal/relay 路由、ticket 一次消费、counter 和连接替换。
RemoteNettyServerLifecycleTest.java: 通过 JDK WebSocket 客户端验证真实 TCP/HTTP Upgrade、Bearer 鉴权、Origin 和 hello.ack 进程级链路。
RemoteWebSocketProbeMain.java: 独立 JVM 的最小 WebSocket 客户端，验证 `ws://`/`wss://` hello.ack 进程边界，不属于生产 client。
RemoteControlServiceIntegrationTest.java: 使用真实 Redis/PostgreSQL 验证 ticket、lease、revoke、presence 和租户隔离。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
