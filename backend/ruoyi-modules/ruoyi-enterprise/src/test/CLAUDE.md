# test/

> L2 | 父级: ../CLAUDE.md

成员清单

java/org/dromara/enterprise/crypto/SecretCipherTest.java: 验证全部封闭用途 AES-GCM round trip、随机 nonce、AAD/用途隔离、篡改认证与防御性复制。
java/org/dromara/enterprise/auth/LocalIdentityAdapterTest.java: 验证 RuoYi BCrypt、失败策略复用、稳定 userId subject、停用与不存在账号同形失败。
java/org/dromara/enterprise/auth/OidcIdentityAdapterTest.java: 使用 WireMock、真实 RSA ID Token 和轮换 JWKS 验证 Discovery 声明算法、code+PKCE、issuer/aud/nonce 与 claim 白名单。
java/org/dromara/enterprise/auth/LdapIdentityAdapterTest.java: 使用 StartTLS OpenLDAP 验证 manager search、用户 bind、LDAPS/StartTLS 互斥、RFC 4515 转义和 entryUUID 稳定 subject。
java/org/dromara/enterprise/auth/IdentityPersistenceIntegrationTest.java: 以真实 PostgreSQL 验证身份秘密隔离、keyset、资源 CAS、revision/审计回滚、活动用户名冲突下的稳定 subject、显式绑定冲突和多部门映射冲突。
java/org/dromara/enterprise/auth/IdentityAdminApiTest.java: 以 MockMvc 和 OpenAPI 派生 schema 验证 T04 十个管理 operation、认证 cursor、requestId、权限码、revision 错误与秘密输出隔离。
java/org/dromara/enterprise/auth/EnterpriseAuthResourceConfigurationTest.java: 以真实 Spring MVC 资源链验证 login.html/css/js、密码失败留页与首次改密控制逻辑可达且模块文档不公开。
java/org/dromara/enterprise/auth/EnterpriseIdentityConfigurationTest.java: 验证 Java 公网 HTTPS authority 接受默认/合法显式端口并拒绝端口越界、路径、查询和 user-info。
java/org/dromara/enterprise/auth/PlatformAuthorizationSecurityTest.java: 使用真实 Redis 验证 S256/redirect/client 参数、code 原子消费、并发交换、取消和失效事务零用户副作用。
java/org/dromara/enterprise/auth/RedisAuthStateStoreIntegrationTest.java: 使用 Redis 8 验证 5 分钟事务、60 秒 code、GETDEL 唯一消费、过期/取消与 OIDC key 分区。
java/org/dromara/enterprise/auth/T05ApiContractTest.java: 以 MockMvc 和派生 JSON Schema 验证七个认证、HTML 密码失败留页、JSON 错误兼容、五个设备 operation、权限注解及显式撤销 Token 的 403 协议翻译。
java/org/dromara/enterprise/device/DeviceContextIsolationTest.java: 证明伪造 X-Device-Id 不会覆盖 Sa-Token terminal 的 installation 授权事实。
java/org/dromara/enterprise/device/DeviceLifecycleIntegrationTest.java: 以真实 PostgreSQL 验证多设备 owner、heartbeat 审计限频/状态切换、CAS、审计同事务与单设备撤销隔离。
java/org/dromara/enterprise/model/ProviderProbeTest.java: 使用 WireMock 验证 `/models` Bearer 探测、状态分类、正文隔离与 no-redirect。
java/org/dromara/enterprise/model/EffectiveModelResolverTest.java: 纯单元验证 USER 默认缺失时的 DEPT 默认选择与空候选边界。
java/org/dromara/enterprise/model/T08ApiContractTest.java: 以 MockMvc/JSON Schema 验证模型管理及 bootstrap 全 operation 的成功/失败协议、Session 策略启用、权限码与密钥不回显。
java/org/dromara/enterprise/model/ModelManagementIntegrationTest.java: 以显式活动用户和真实 PostgreSQL 验证密文/CAS/回滚、幂等删除、授权并集、默认优先级、停用与 ACTIVE bootstrap，不借用上游默认账号。
java/org/dromara/enterprise/model/gateway/GatewayChatRequestParserTest.java: 验证严格 OpenAI 顶层字段、thinking/effort、文本/tool 消息、stream 与受管 route 强制替换。
java/org/dromara/enterprise/model/gateway/GatewayRouteResolverTest.java: 验证 alias/default、ACTIVE 设备/用户与当前 model/provider/grant 的每请求裁决。
java/org/dromara/enterprise/model/gateway/DeepSeekUpstreamClientTest.java: 使用 WireMock 验证 DeepSeek SSE、Bearer、reasoning/tool/usage、状态分类、timeout 与 no-redirect。
java/org/dromara/enterprise/model/gateway/ModelGatewayServiceTest.java: 验证 reasoning 能力前置复核、reserve/SENT、settle/CHARGED_MAX、取消与双审计关联。
java/org/dromara/enterprise/model/gateway/ModelGatewayTransactionIntegrationTest.java: 以显式活动用户和真实 PostgreSQL 验证 SENT/accepted 与 ledger/finished 原子提交及审计失败共同回滚。
java/org/dromara/enterprise/model/gateway/T10GatewayApiContractTest.java: 以 MockMvc/JSON Schema 验证 gateway SSE/JSON 内容协商、严格输入、体积和全部首字节前错误映射。
java/org/dromara/enterprise/quota/QuotaWindowCalculatorTest.java: 验证冻结部署时区自然日/月边界和 UTF-8 字节除三向上估算。
java/org/dromara/enterprise/quota/application/QuotaOrderingTest.java: 验证有效策略和预留/结算窗口共享 policy/type 固定锁序，阻止历史 window ID 造成反向加锁。
java/org/dromara/enterprise/quota/RedisQuotaRateLimiterTest.java: 使用真实 Redis 8 验证多策略 Lua 全成全败、RPM、并发续租与 TTL 回收。
java/org/dromara/enterprise/quota/QuotaManagementIntegrationTest.java: 以显式活动用户和真实 PostgreSQL 验证策略/CAS/bootstrap、50 并发防超卖、状态机、幂等、结算与恢复。
java/org/dromara/enterprise/quota/T09ApiContractTest.java: 以 MockMvc/JSON Schema 验证十个配额/用量 operation、ACTIVE 设备/用户边界、稳定错误细节与 ledger 脱敏。
java/org/dromara/enterprise/plugin/PluginArtifactSecurityTest.java: 以不落地解压的恶意 tgz 验证路径、链接、设备、原生模块、metadata、归档上限、CAS、同 hash 互斥与磁盘 fail-closed。
java/org/dromara/enterprise/plugin/PluginManifestSignerTest.java: 以 RFC 8785 已知向量和真实 PKCS#8 key 验证 JCS/Ed25519 签名声明及私钥文件边界。
java/org/dromara/enterprise/plugin/PluginServerIntegrationTest.java: 以三个显式活动用户和真实 PostgreSQL 验证并发幂等上传、catalog assignment 读回、状态/CAS、分配优先级、下载授权、库存、审计与文件补偿。
java/org/dromara/enterprise/plugin/T13ApiContractTest.java: 以 MockMvc/JSON Schema 验证九个插件 operation、catalog 完整 assignment 投影、权限码、稳定错误和下载头。
java/org/dromara/enterprise/plugin/PluginTestArtifacts.java: 集中生成无脚本、无依赖、精确 rc.7 peer 的合法预构建 bundle tgz fixture。
java/org/dromara/enterprise/session/: T16 精确 JSONL/hash、并发远端副本、正文权限、tombstone 与 V9 协议纵向门禁；局部地图见 session/CLAUDE.md。
java/org/dromara/enterprise/audit/: T19 30-action metadata 白名单、requestId 关联、用户治理接缝与 365 天 retention 门禁；局部地图见 audit/CLAUDE.md。
java/org/dromara/enterprise/common/api/: T20 有界 JSON 请求、稳定 413/503 与故障日志秘密隔离门禁；局部地图见 common/api/CLAUDE.md。
java/org/dromara/enterprise/test/OpenLdapTestServer.java: 共享 OpenLDAP Testcontainer 与测试专用 TLS trust，集中管理 LDAP 集成环境。
java/org/dromara/enterprise/test/RedisTestServer.java: 共享 Redis 8 Testcontainer，并为每项认证测试清理隔离 keyspace。
java/org/dromara/enterprise/database/EnterpriseMigrationTest.java: 从真实 RuoYi PostgreSQL 基线验证 V1-V12 逐版本升级、已知凭据清理、部署状态与 Boot 4 自动迁移装配。
java/org/dromara/enterprise/deployment/DeploymentBootstrapServiceTest.java: 以真实 PostgreSQL 验证缺配置失败、事务回滚、幂等管理员/角色/marker 和 JDBC 首次强制改密。
java/org/dromara/enterprise/database/RbacSeedTest.java: 验证五个 built-in 角色、14 个冻结权限码、最小权限集合与数据库不可变 trigger。
java/org/dromara/enterprise/revision/RevisionAuditIntegrationTest.java: 验证 BOOTSTRAP CAS、稳定冲突码、显式 metadata、只追加审计及同事务回滚。
java/org/dromara/enterprise/test/PostgresTestDatabase.java: 共享 PostgreSQL 17 Testcontainer，为每组验收创建独立数据库、加载上游真实基线，并提供不依赖默认账号的最小活动用户 fixture。
resources/ldap/bootstrap.ldif: OpenLDAP 集成测试的固定组织、用户与可验证属性数据，不含生产秘密。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
