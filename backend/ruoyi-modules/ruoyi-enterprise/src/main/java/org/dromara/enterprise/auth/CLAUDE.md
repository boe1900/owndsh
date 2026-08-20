# auth/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseIdentityConfiguration.java: 身份纵向模块 composition root，统一校验可带合法端口的 HTTPS authority，并从部署 URI/master key、Redis/JDBC/事务装配三个 adapter、PKCE 状态机与 Sa-Token 端口。
EnterpriseIdentityProperties.java: enterprise tenant/public base/admin redirect、crypto master key 路径和开发期非 HTTPS OIDC 开关的强类型配置边界。
adapter/: OIDC、LDAP、LOCAL 协议实现与统一 IdentityAdapter 路由；局部地图见 adapter/CLAUDE.md。
application/: 身份配置/绑定事务与 PKCE 登录、Token、logout 状态机；局部地图见 application/CLAUDE.md。
domain/: 身份源、凭据、principal、Redis 短期状态和固定 public client 模型；局部地图见 domain/CLAUDE.md。
persistence/: 身份/平台用户 PostgreSQL 端口及登录事务、OIDC state、授权码 Redis adapter；局部地图见 persistence/CLAUDE.md。
web/: 受保护的身份管理 API与公开认证门面、可信上下文及脱敏 DTO；局部地图见 web/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
