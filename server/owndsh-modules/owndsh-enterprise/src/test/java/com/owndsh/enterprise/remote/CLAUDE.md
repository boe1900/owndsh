# remote/

> L2 | 父级: ../../../../../CLAUDE.md

成员清单

RemoteDeviceSnapshotTest.java: 验证设备状态、远控开关和 presence TTL 的连接资格不变量。
RemoteTicketRequestTest.java: 验证控制端 ID、公钥和 capability 输入边界。
RemoteTicketStateTest.java: 验证升级前十字段 Redis JSON 默认 Harness 来源，以及 Console 状态拒绝伪造 installation。
RemoteWebSocketHandlerTest.java: 验证 Java carrier 的 hello、协议字段、Cookie Upgrade 和关闭码边界。
RemoteGatewayTest.java: 验证已认证密钥覆盖、角色/握手步骤、双端 lease ACK、空闲到期、续租、撤销、暂时不可写时有序转发与仅关闭 Link。
RemoteGatewayDisconnectTest.java: 准确连接 CAS、重复/并发断开、Redis 撤销故障时阻断、Host 持续在线与旧帧/陈旧确认不能误伤新连接。
RemoteGatewayFixture.java: 协议帧、认证 Pair、可推进时钟与授权存储夹具，由协议、预算与 eventloop 测试共享，发送经过实际 Gateway。
RemotePendingWrites.java: 慢消费者测试 handler，持有 frame/promise 并控制完成、失败和关闭回收，明确测试端 ByteBuf 所有权。
RemoteGatewayOutboundTest.java: 验证 UTF-8 字节和帧数预算、成功/失败回收、旧 Channel 隔离、同步 ACK 失败重入、积压时撤权与单次 Close 截止时间。
RemoteGatewayEventLoopTest.java: 通过两个真实 Netty eventloop 和 latch 验证未执行写任务计入预算，任务/关闭 deadline 拒绝后仍释放消息并隔离故障 carrier。
RemoteNettyServerLifecycleTest.java: 通过 JDK WebSocket 客户端验证真实 TCP/HTTP Upgrade、Bearer 鉴权、Origin 和 hello.ack 进程级链路。
RemoteWebSocketProbeMain.java: 独立 JVM 的最小 WebSocket 客户端，验证 `ws://`/`wss://` hello.ack 进程边界，不属于生产 client。
RemoteControlServiceIntegrationTest.java: 真实 Redis/PostgreSQL 验证 owner/installation 隔离、Console 登录及跨来源拒绝、并发不可换钥 pin、租约持续目标授权、Console 本人设备 guard、Gateway adapter 的真实 Redis 撤销和旧 Harness ticket。
RemoteEmployeeApiTest.java: MockMvc 验证员工 Bearer/安装准入、owner cursor 隔离、设备列表无密钥及新旧 ticket JSON 形状。
RemoteConsoleApiTest.java: MockMvc 使用真实同源上下文解析器验证本人连接操作/输入边界、owner/404/409、本人分页、跨登录/账号 cursor 拒绝、Host pin、外站写和 Harness/退出拒绝。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
