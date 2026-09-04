# auth/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseIdentityConfiguration.java: 身份纵向模块 composition root，从部署 URI/环境 master key、Redis/JDBC/事务装配成员目录、三个 adapter、PKCE、PostgreSQL Refresh Session 与 Sa-Token 端口。
EnterpriseIdentityProperties.java: enterprise tenant/public base、crypto master key 和非 HTTPS OIDC 开关的环境配置边界；管理端回调固定从 public base 派生。
adapter/: OIDC、LDAP、LOCAL 协议实现与统一 IdentityAdapter 路由；局部地图见 adapter/CLAUDE.md。
application/: 成员治理、身份配置/绑定、PKCE 登录、Access/Refresh Token 与 logout 状态机；局部地图见 application/CLAUDE.md。
domain/: 身份源、产品用户组、凭据、Redis 短期状态、固定 public client 与 Refresh Session family 模型；局部地图见 domain/CLAUDE.md。
persistence/: 身份/平台用户/Refresh Session PostgreSQL 端口及登录事务、OIDC state、授权码 Redis adapter；局部地图见 persistence/CLAUDE.md。
web/: 受保护的身份管理 API 与 code/refresh 公开认证门面、可信上下文及脱敏 DTO；局部地图见 web/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
