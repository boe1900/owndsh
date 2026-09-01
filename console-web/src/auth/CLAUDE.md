# auth/

> L2 | 父级: ../CLAUDE.md

成员清单

session.ts: enterprise-admin 当前标签页 Token、OpenAPI client 认证、产品 bootstrap 单飞缓存与服务端成功后注销的唯一会话边界。
pkce.ts: Web Crypto S256、一次性 state/verifier 和安全 returnTo 的 public-client 登录状态机，复用 Server 身份源页面。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
