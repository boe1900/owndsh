# adapter/

> L2 | 父级: ../CLAUDE.md

成员清单

IdentityAdapter.java: OIDC/LDAP/LOCAL 的统一认证与连接检查端口，只允许输出 IdentityPrincipal。
IdentityAdapterRegistry.java: 按身份源类型唯一索引 adapter，并封装仅 LOCAL 可达的首次改密入口。
IdentityAuthenticationException.java: 统一认证失败异常，不携带账号、密码或外部响应。
IdentityEndpointPolicy.java: OIDC HTTPS 与 LDAP LDAPS/StartTLS 互斥传输安全策略。
IdentitySourceConfigurationException.java: 外部身份源配置/连接失败边界，不泄漏秘密。
IdentitySourceConnection.java: 连接检查的脱敏 type/ok/diagnostic 响应值。
JdbcLocalAccountStore.java: 读取 LOCAL 最小投影，并以 userId/旧 hash/首次改密标记三重条件原子更新密码。
LdapFilterEscaper.java: RFC 4515 用户名过滤值转义，阻断 LDAP filter 注入。
LdapIdentityAdapter.java: 使用 manager search、用户 bind、LDAPS/StartTLS 和稳定属性投影 LDAP principal，并提供最多 50 条用户/组发现与 Base DN/userFilter 双约束重读。
LocalAccount.java: 防止 password hash 进入字符串输出、携带首次改密事实的 LOCAL 账号值对象。
LocalAccountStore.java: LOCAL 账号查询与受限条件改密端口，使认证逻辑不依赖 JDBC。
LocalIdentityAdapter.java: 复用 Host BCrypt/失败锁定的 LOCAL adapter，分离初始认证与 challenge 后条件改密，以 userId 为稳定 subject。
LocalPasswordChangeRejectedException.java: 新密码策略、旧密码复用或条件更新失败的无敏感字段拒绝信号。
LocalPasswordChangeRequiredException.java: 旧密码正确且仍需首次改密时携带已认证 principal 的流程信号，不伪装成密码错误。
LoginFailurePolicy.java: Host 失败计数/锁定能力的依赖倒置端口。
OidcIdentityAdapter.java: Nimbus Discovery、Authorization Code+PKCE、声明算法/JWKS/issuer/aud/nonce 校验与 claim 白名单投影。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
