# domain/

> L2 | 父级: ../CLAUDE.md

成员清单

ExternalGroupMapping.java: 外部组到单一扁平产品用户组的显式 revisioned 映射事实。
AccessGroup.java: 扁平产品用户组、手工成员、有效成员数和 revision 的批量授权主体事实。
ExternalIdentity.java: source/issuer/stable subject 到平台用户的唯一绑定与最近组/登录事实。
ExternalIdentitySummary.java: tenant/user 限定的身份源名称、类型、稳定 subject 与最后登录脱敏管理投影。
IdentityCredential.java: PasswordCredentials 与 OidcCodeCredentials 的封闭凭据类型根。
IdentityPrincipal.java: 三种 adapter 的统一稳定 subject、白名单 profile 与外部组缺失/存在语义输出。
IdentityProvisioningMode.java: JIT/LINK_ONLY 封闭集合，只裁决未知外部身份的成员生命周期。
IdentitySource.java: 强制 OIDC/LDAP/LOCAL 配置互斥、LOCAL 不 JIT、秘密独立持有与脱敏连接测试的聚合根。
IdentitySourceStatus.java: ACTIVE/DISABLED 身份源状态集合。
IdentitySourceType.java: OIDC/LDAP/LOCAL 身份源类型集合。
LdapDirectory.java: 管理端按需发现的 LDAP 用户/组白名单值对象，只携带可信 DN、统一 principal 与组显示名。
LdapSettings.java: 不含 manager 密码的 LDAP 用户/组搜索、稳定属性和 LDAPS/StartTLS 配置。
LoginTransaction.java: 5 分钟 Redis 事务，绑定 client/redirect/S256/CSRF 与可选的成员、身份源、发起管理员绑定目标。
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
RefreshSession.java: 不含 Token 摘要的 Refresh family 用户/client/installation、绝对到期、轮换状态与封闭撤销原因事实。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
