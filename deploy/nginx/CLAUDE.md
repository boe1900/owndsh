# nginx/

> L2 | 父级: ../CLAUDE.md

成员清单

nginx.conf: 终止 TLS、发布管理端 SPA 及其精确认证回调，只代理 OpenAPI admin/api/auth 与 Gateway 入口，以 strict-origin 支持同源表单 CORS 且不泄露登录事务路径，覆盖全部客户端 forwarding header，并把 Nginx 运行时临时写入约束到 tmpfs。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
