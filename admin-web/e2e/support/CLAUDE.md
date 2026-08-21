# support/

> L2 | 父级: ../CLAUDE.md

成员清单

enterprise-auth.ts: 真实 enterprise-admin/dsh-desktop PKCE 与 LOCAL 登录共享夹具，统一响应解包和 bearer 路径且不持久化 Token。
https-proxy.mjs: 在标准 443 端口统一管理端、企业认证静态页和 Server API origin，并注入可信 HTTPS 转发事实。
mock-upstream.mjs: 提供按路径隔离、可重复执行的 OIDC Discovery/JWKS 与 DeepSeek-compatible models/chat 端点，不接收或记录 credential。
nginx.conf: Docker 化标准 443 HTTPS 验收入口，按 127.0.0.1/localhost 隔离两组管理端与 Server，并精确路由 API 和认证静态资源。
support.test.mjs: 静态约束 LOCAL 账号/密码精确标签，防止首次改密字段导致共享登录 helper 严格模式歧义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
