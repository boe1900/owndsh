# auth/

> L2 | 父级: ../CLAUDE.md

成员清单

session.ts: 以服务端 HttpOnly Cookie 为唯一认证事实，提供 bootstrap 单飞缓存、同源注销和本人改密；不读取、保存、注入或跨标签复制 Token。
pkce.ts: Web Crypto S256、一次性 sessionStorage state/verifier 和经浏览器 URL 解析后同源校验的 returnTo 状态机，通过专用交换端点建立 HttpOnly Cookie。
pkce.test.ts: 返回路径安全回归，覆盖反斜杠、控制字符、路径归一化、登录循环和站内查询/片段。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
