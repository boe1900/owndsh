# domain/

> L2 | 父级: ../CLAUDE.md

成员清单

ExternalGroupMapping.java: 外部组到单一 RuoYi 部门的显式 revisioned 映射事实。
ExternalIdentity.java: source/issuer/stable subject 到平台用户的唯一绑定与最近组/登录事实。
IdentityCredential.java: PasswordCredentials 与 OidcCodeCredentials 的封闭凭据类型根。
IdentityPrincipal.java: 三种 adapter 的统一稳定 subject、白名单 profile 与外部组输出。
IdentitySource.java: 强制 OIDC/LDAP/LOCAL 配置互斥且秘密独立持有的聚合根。
IdentitySourceStatus.java: ACTIVE/DISABLED 身份源状态集合。
IdentitySourceType.java: OIDC/LDAP/LOCAL 身份源类型集合。
LdapSettings.java: 不含 manager 密码的 LDAP URL、搜索与稳定属性配置。
OidcClaimMapping.java: OIDC 原始 claims 到统一 principal 的显式白名单。
OidcCodeCredentials.java: T05 状态校验后用于 code+PKCE 交换的一次性脱敏凭据。
OidcSettings.java: 强制 openid scope 与不可变 claim mapping 的 OIDC 配置。
PasswordCredentials.java: LOCAL/LDAP 一次性用户名密码凭据，防御性复制并支持清零。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
