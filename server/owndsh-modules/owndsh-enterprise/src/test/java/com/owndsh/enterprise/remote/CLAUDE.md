# remote/

> L2 | 父级: ../../../../../CLAUDE.md

成员清单

RemoteDeviceSnapshotTest.java: 验证设备状态、远控开关和 presence TTL 的连接资格不变量。
RemoteTicketRequestTest.java: 验证控制端 ID、公钥和 capability 输入边界。
RemoteWebSocketHandlerTest.java: 验证 Java carrier 的 hello、协议字段、Cookie Upgrade 和关闭码边界。
RemoteGatewayTest.java: 验证已认证密钥覆盖、角色/握手步骤、双端 lease ACK、空闲到期、续租、撤销与仅关闭 Link。
RemoteNettyServerLifecycleTest.java: 通过 JDK WebSocket 客户端验证真实 TCP/HTTP Upgrade、Bearer 鉴权、Origin 和 hello.ack 进程级链路。
RemoteWebSocketProbeMain.java: 独立 JVM 的最小 WebSocket 客户端，验证 `ws://`/`wss://` hello.ack 进程边界，不属于生产 client。
RemoteControlServiceIntegrationTest.java: 真实 Redis/PostgreSQL 验证 owner/installation 隔离、并发不可换钥 pin、消费后租约、长连接 TTL 和撤销。
RemoteEmployeeApiTest.java: MockMvc 验证员工 Bearer/安装准入、owner cursor 隔离、设备列表无密钥及新旧 ticket JSON 形状。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
