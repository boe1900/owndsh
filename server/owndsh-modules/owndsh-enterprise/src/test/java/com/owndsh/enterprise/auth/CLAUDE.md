# auth/

> L2 | 父级: ../../../../../CLAUDE.md

成员清单

ConsoleBootstrapControllerTest.java: 验证控制台 bootstrap 只投影当前账号、登录来源、固定角色、产品权限与部署标识。
ConsoleDevOriginsTest.java: 验证调试白名单 loopback-only/显式端口/无路径 query fragment 启动校验、console 回调逐字节派生匹配与 Origin scheme/host/port 比较语义。
AdminSessionCookieTest.java: 验证安全方法跳过、同源放行、部署调试 origin 豁免与跨源/未配置拒绝的写保护边界。
EnterpriseAuthResourceConfigurationTest.java: 验证登录静态资源映射、两阶段改密页面与凭据清理边界。
EnterpriseIdentityConfigurationTest.java: 验证公网 HTTP(S) authority 的协议/端口/结构约束、环境 master key 的精确 32 字节边界与 console 调试 origin 空串/逗号串环境绑定。
IdentityAdminApiTest.java: 以 MockMvc 和派生 schema 验证身份源、映射、用户组、认证 cursor、权限与秘密隔离。
IdentityPersistenceIntegrationTest.java: 以真实 PostgreSQL 验证身份、绑定、目录导入、用户组与审计事务边界。
LdapIdentityAdapterTest.java: 以 OpenLDAP 验证 StartTLS 用户 bind、目录查询转义与稳定 subject，并校验明文 LDAP 放行及 LDAPS/StartTLS 冲突拒绝。
LocalIdentityAdapterTest.java: 验证 Host BCrypt、统一失败策略、稳定 subject 与停用用户拒绝。
MemberDirectoryQueryServiceTest.java: 以真实 PostgreSQL 验证成员 cursor/detail、角色、登录方式与设备/Session 聚合。
MemberManagementServiceTest.java: 以真实 PostgreSQL 验证 LOCAL 建号、改密、角色、停用、会话撤销与身份解绑。
OidcIdentityAdapterTest.java: 以 WireMock 和真实签名验证 Discovery、PKCE、OIDC claims 与 JWKS 轮换。
PlatformAuthorizationSecurityTest.java: 以真实 Redis 验证 PKCE、登录事务、授权码并发消费与 Refresh Session 接缝；覆盖部署 loopback 调试回调仅精确放行、installationId 混用拒绝，且不影响 Desktop 回调与默认空白名单。
RedisAuthStateStoreIntegrationTest.java: 以真实 Redis 验证认证事务、授权码 TTL、GETDEL 与 namespace 隔离。
RefreshSessionServiceIntegrationTest.java: 以真实 PostgreSQL 验证 Refresh Token 摘要落库、installation 绑定、单次轮换、重放补偿与 family 吊销。
T05ApiContractTest.java: 以 MockMvc 和派生 schema 验证 code/refresh token、浏览器 Cookie、密码流程、设备与权限 HTTP 契约。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
