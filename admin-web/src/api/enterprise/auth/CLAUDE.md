# auth/

> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: enterprise-admin token exchange/logout 请求边界，只接受统一企业响应。
pkce.ts: 浏览器 PKCE S256 事务状态机，state/verifier 仅存当前标签页并一次性消费。
pkce.test.ts: enterprise-admin PKCE 回调、RuoYi 请求 client 同构与一次性事务消费回归门禁。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
