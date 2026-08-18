# adapter/

> L2 | 父级: ../CLAUDE.md

成员清单

IdentityAdapter.java: OIDC/LDAP/LOCAL 的统一认证与连接检查端口，只允许输出 IdentityPrincipal。
IdentityAdapterRegistry.java: 按身份源类型唯一索引 adapter，并在认证前拒绝停用源。
IdentityAuthenticationException.java: 统一认证失败异常，不携带账号、密码或外部响应。
IdentityEndpointPolicy.java: OIDC HTTPS 与 LDAP LDAPS/StartTLS 互斥传输安全策略。
IdentitySourceConfigurationException.java: 外部身份源配置/连接失败边界，不泄漏秘密。
IdentitySourceConnection.java: 连接检查的脱敏 type/ok/diagnostic 响应值。
JdbcLocalAccountStore.java: 只读取 LOCAL 认证所需 sys_user 字段的 JDBC adapter。
LdapFilterEscaper.java: RFC 4515 用户名过滤值转义，阻断 LDAP filter 注入。
LdapIdentityAdapter.java: 使用 manager search、用户 bind、LDAPS/StartTLS 和稳定属性投影 LDAP principal。
LocalAccount.java: 防止 password hash 进入字符串输出的 LOCAL 账号值对象。
LocalAccountStore.java: LOCAL 账号查询端口，使认证逻辑不依赖 JDBC。
LocalIdentityAdapter.java: 复用 RuoYi BCrypt 与失败锁定策略的 LOCAL adapter，以 userId 为稳定 subject。
LoginFailurePolicy.java: RuoYi 失败计数/锁定能力的依赖倒置端口。
OidcIdentityAdapter.java: Nimbus Discovery、Authorization Code+PKCE、声明算法/JWKS/issuer/aud/nonce 校验与 claim 白名单投影。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
