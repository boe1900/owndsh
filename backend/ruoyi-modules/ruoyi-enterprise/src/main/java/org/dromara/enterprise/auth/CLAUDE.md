# auth/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseIdentityConfiguration.java: 身份纵向模块 composition root，从部署 master key 装配秘密/cursor 密码学、stores、三个 adapter 与 Application Service。
EnterpriseIdentityProperties.java: enterprise.tenant-id、crypto.master-key-file 和开发期非 HTTPS OIDC 开关的强类型配置边界。
adapter/: OIDC、LDAP、LOCAL 协议实现与统一 IdentityAdapter 路由；局部地图见 adapter/CLAUDE.md。
application/: 身份源、组映射和外部身份绑定事务用例；局部地图见 application/CLAUDE.md。
domain/: 身份源、凭据、principal 和绑定事实的持久化无关模型；局部地图见 domain/CLAUDE.md。
persistence/: 身份与平台用户端口及 PostgreSQL JDBC adapters；局部地图见 persistence/CLAUDE.md。
web/: 受 ent:identity 权限保护的管理 API、可信请求上下文和脱敏 DTO；局部地图见 web/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
