# support/

> L2 | 父级: ../CLAUDE.md

成员清单

https-proxy.mjs: 在标准 443 端口统一管理端、企业认证静态页和 Server API origin，并注入可信 HTTPS 转发事实。
mock-upstream.mjs: 提供按路径隔离、可重复执行的 OIDC Discovery/JWKS 与 DeepSeek-compatible models/chat 端点，不接收或记录 credential。
nginx.conf: Docker 化标准 443 HTTPS 验收入口，把 dev/prod API 与认证静态资源定向 Server，其余页面定向管理端。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
