# auth/

> L2 | 父级: ../CLAUDE.md

成员清单

session.ts: 以服务端 HttpOnly Cookie 为唯一认证事实，提供 bootstrap 单飞缓存、同源注销和本人改密；不读取、保存、注入或跨标签复制 Token。
pkce.ts: Web Crypto S256、一次性 sessionStorage state/verifier 和安全 returnTo 的 public-client 状态机，通过浏览器专用交换端点建立 HttpOnly Cookie。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
