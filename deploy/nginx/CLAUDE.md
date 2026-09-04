# nginx/

> L2 | 父级: ../CLAUDE.md

成员清单

nginx.conf: 终止 TLS、发布 Console SPA 及其精确认证回调，只代理 OpenAPI admin/api/auth 与模型网关入口；生产域名启用 HSTS，本机 host 清除 HSTS 以保留 Harness HTTP loopback callback，并覆盖全部客户端 forwarding header、限制临时写入 tmpfs。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
