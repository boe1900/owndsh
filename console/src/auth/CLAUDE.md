# auth/

> L2 | 父级: ../CLAUDE.md

成员清单

session.ts: 以服务端 HttpOnly Cookie 为唯一认证事实，提供 bootstrap 单飞缓存、同源注销和本人改密；不读取、保存、注入或跨标签复制 Token。
pkce.ts: 以 @noble/hashes 纯 JavaScript SHA-256 和 getRandomValues 在 HTTP/HTTPS 生成 S256，使用一次性 sessionStorage state/verifier 与同源 returnTo，通过专用交换端点建立 HttpOnly Cookie。
pkce.test.ts: 在缺少 subtle/randomUUID 时验证 S256 授权请求、RFC 7636 向量和一次性交换，并覆盖返回路径的反斜杠、控制字符、路径归一化与登录循环。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
