# test/

> L2 | 父级: ../CLAUDE.md

成员清单

java/com/owndsh/enterprise/mcp/: MCP 组授权的 PostgreSQL/MockMvc 纵向门禁；局部地图见 mcp/CLAUDE.md。

java/com/owndsh/enterprise/crypto/SecretCipherTest.java: 验证全部封闭用途 AES-GCM round trip、随机 nonce、AAD/用途隔离、篡改认证与防御性复制。
java/com/owndsh/enterprise/auth/: 身份、PKCE、Access/Refresh Session、成员治理与认证 HTTP 契约门禁；局部地图见 auth/CLAUDE.md。
java/com/owndsh/enterprise/device/DeviceContextIsolationTest.java: 证明伪造 X-Device-Id 不会覆盖 Sa-Token terminal 的 installation 授权事实。
java/com/owndsh/enterprise/device/DeviceLifecycleIntegrationTest.java: 以真实 PostgreSQL 验证多设备 owner、heartbeat 审计限频/状态切换、CAS、审计同事务与单设备撤销隔离。
java/com/owndsh/enterprise/model/ProviderProbeTest.java: 使用 WireMock 验证 `/models` Bearer 探测、模型 ID 提取、正文隔离、状态分类与 no-redirect。
java/com/owndsh/enterprise/model/EffectiveModelResolverTest.java: 纯单元验证全员/成员候选的排序首项默认、重复模型去重与空候选边界。
java/com/owndsh/enterprise/model/T08ApiContractTest.java: 以 MockMvc/JSON Schema 验证 Provider、模型、模型集、授权及 bootstrap operation 的成功/失败协议、权限码与密钥不回显。
java/com/owndsh/enterprise/model/ModelManagementIntegrationTest.java: 以显式活动用户和真实 PostgreSQL 验证 Harness route ID、三协议投影、官方保留路由、reasoning 三态、密文/CAS/回滚、用户组/模型集授权展开、删除引用保护、停用与 ACTIVE bootstrap。
java/com/owndsh/enterprise/model/gateway/GatewayChatRequestParserTest.java: 验证三协议输出上限类型、溢出、字段互斥与协议混用拒绝，以及原生正文透明保留与受管 route 强制替换。
java/com/owndsh/enterprise/model/gateway/GatewayRouteResolverTest.java: 验证 alias/default、ACTIVE 设备/用户与当前 model/provider/grant 的每请求裁决。
java/com/owndsh/enterprise/model/gateway/DeepSeekUpstreamClientTest.java: 使用 WireMock 验证三协议 endpoint/auth、SSE、单次请求、状态/脱敏阶段分类、timeout 与 no-redirect。
java/com/owndsh/enterprise/model/gateway/GatewayUsageInspectorTest.java: 验证缓存别名去重、缓存写入、最终 usage 提前确认、Anthropic 稀疏更新与非法计数拒绝。
java/com/owndsh/enterprise/model/gateway/ModelGatewayServiceTest.java: 验证输出上限、发送前意图、响应头及阻塞心跳期间续租、静默上游取消的关闭顺序与幂等、usage 保留及三协议错误。
java/com/owndsh/enterprise/model/gateway/ModelGatewayTransactionIntegrationTest.java: 真实 PostgreSQL 验证结算/usage 快照恢复；Jetty/MVC 与 JDK HTTP 重现静默上游，验证 SSE 心跳、断开/超时 10 秒内关闭与唯一结算。
java/com/owndsh/enterprise/model/gateway/T10GatewayApiContractTest.java: 以 MockMvc/JSON Schema 验证 gateway SSE/JSON 内容协商、严格输入、体积和全部首字节前错误映射。
java/com/owndsh/enterprise/quota/QuotaWindowCalculatorTest.java: 验证策略锚点连续 5 小时、冻结部署时区自然日/周/月边界和 UTF-8 字节除三向上估算。
java/com/owndsh/enterprise/quota/application/QuotaOrderingTest.java: 验证有效策略和预留/结算窗口共享 policy/type 固定锁序，阻止历史 window ID 造成反向加锁。
java/com/owndsh/enterprise/quota/RedisQuotaRateLimiterTest.java: 使用真实 Redis 8 验证多策略 Lua 全成全败、RPM、并发续租与 TTL 回收。
java/com/owndsh/enterprise/quota/QuotaManagementIntegrationTest.java: 真实 PostgreSQL 验证 TOKEN/RATE、策略叠加、四窗口/CAS、并发预留及恢复；已获准请求超额按实测结算，拒绝后续请求且不截断其他在途结算。
java/com/owndsh/enterprise/quota/T09ApiContractTest.java: 以 MockMvc/JSON Schema 验证带策略类型的配额/用量 operation、四窗口与资源范围、ACTIVE 设备/用户边界及 ledger 脱敏。
java/com/owndsh/enterprise/plugin/PluginServerIntegrationTest.java: PostgreSQL 验证登记/并发幂等、发布/退休、范围优先级、库存与审计；新增发布升级双 revision、精确迁移、撤回/停用/其他版本保留和审计失败全事务回滚。
java/com/owndsh/enterprise/plugin/T13ApiContractTest.java: MockMvc/JSON Schema 验证八个插件 operation、JSON 登记、发布升级参数与缺失/非法字段拒绝，以及固定权限码。
java/com/owndsh/enterprise/session/: T16 精确 JSONL/hash、并发远端副本、正文权限、tombstone 与 V9 协议纵向门禁；局部地图见 session/CLAUDE.md。
java/com/owndsh/enterprise/audit/: 31-action metadata 白名单、requestId 关联、用户治理接缝与 365 天 retention 门禁；局部地图见 audit/CLAUDE.md。
java/com/owndsh/enterprise/common/api/: T20 有界 JSON 请求、稳定 413/503 与故障日志秘密隔离门禁；局部地图见 common/api/CLAUDE.md。
java/com/owndsh/enterprise/test/OpenLdapTestServer.java: 共享 OpenLDAP Testcontainer 与测试专用 TLS trust，集中管理 LDAP 集成环境。
java/com/owndsh/enterprise/test/RedisTestServer.java: 共享 Redis 8 Testcontainer，并为每项认证测试清理隔离 keyspace。
java/com/owndsh/enterprise/database/EnterpriseMigrationTest.java: 从空库及已有库验证 V0–V34 前向迁移、种子幂等、计量与 MCP 数据约束。
java/com/owndsh/enterprise/deployment/DeploymentBootstrapServiceTest.java: 以真实 PostgreSQL 验证缺配置失败、事务回滚、幂等管理员/角色/marker，以及分步认证和 JDBC 条件首次改密。
java/com/owndsh/enterprise/database/RbacSeedTest.java: 验证五个 built-in 角色、20 个冻结权限码、MCP 管理员全权/审计员只读与数据库不可变 trigger。
java/com/owndsh/enterprise/revision/RevisionAuditIntegrationTest.java: 验证 BOOTSTRAP CAS、稳定冲突码、显式 metadata、只追加审计及同事务回滚。
java/com/owndsh/enterprise/test/PostgresTestDatabase.java: 共享 PostgreSQL 17 Testcontainer，为每组验收创建非超级用户持有的空数据库、从 classpath 执行全部 Flyway 迁移，并提供不依赖默认账号的最小活动用户 fixture。
resources/ldap/bootstrap.ldif: OpenLDAP 集成测试的固定组织、用户与可验证属性数据，不含生产秘密。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
