# domain/

> L2 | 父级: ../CLAUDE.md

成员清单

ExternalGroupMapping.java: 外部组到单一 RuoYi 部门的显式 revisioned 映射事实。
ExternalIdentity.java: source/issuer/stable subject 到平台用户的唯一绑定与最近组/登录事实。
ExternalIdentitySummary.java: tenant/user 限定的身份源名称、类型、稳定 subject 与最后登录脱敏管理投影。
IdentityCredential.java: PasswordCredentials 与 OidcCodeCredentials 的封闭凭据类型根。
IdentityPrincipal.java: 三种 adapter 的统一稳定 subject、白名单 profile 与外部组输出。
IdentitySource.java: 强制 OIDC/LDAP/LOCAL 配置互斥、秘密独立持有并携带最近脱敏连接测试事实的聚合根。
IdentitySourceStatus.java: ACTIVE/DISABLED 身份源状态集合。
IdentitySourceType.java: OIDC/LDAP/LOCAL 身份源类型集合。
LdapSettings.java: 不含 manager 密码的 LDAP URL、搜索与稳定属性配置。
LoginTransaction.java: 5 分钟 Redis 事务，绑定 client/redirect/state/S256 challenge/installation/session device 与 CSRF。
OidcClaimMapping.java: OIDC 原始 claims 到统一 principal 的显式白名单。
OidcCodeCredentials.java: T05 状态校验后用于 code+PKCE 交换的一次性脱敏凭据。
OidcLoginState.java: 与平台 code 分区保存的 OIDC state/nonce/verifier/callback 一次性事实。
OidcSettings.java: 强制 openid scope 与不可变 claim mapping 的 OIDC 配置。
LocalPasswordPolicy.java: bootstrap 与首次改密共享的 LOCAL 长度、字符类别、空白和用户名隔离规则。
PasswordChangeChallenge.java: 5 分钟 Redis 一次性状态，绑定已认证 LOCAL 用户与原登录事务且不保存任何凭据。
PasswordCredentials.java: LOCAL/LDAP 一次性账号与当前密码凭据，防御性复制并显式清零。
Pkce.java: RFC 7636 verifier/challenge 语法、S256 计算与 constant-time 比较真源。
PlatformAuthorizationCode.java: 60 秒一次性 code，绑定 client/redirect/challenge/user/installation/session device。
PlatformClient.java: 固定 dsh-desktop/enterprise-admin 参数集合、回环/管理回调 allowlist 与 terminal 类型。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
