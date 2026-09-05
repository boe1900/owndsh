# nginx/

> L2 | 父级: ../CLAUDE.md

成员清单

nginx.conf: 以 HTTP 8080 发布 Console SPA 及其精确认证回调，只代理 OpenAPI admin/api/auth、模型网关与验证码入口，退役旧 prod-api 通配代理；保留浏览器 Host authority，并透传可选上级代理显式提供的协议/端口，避免宿主端口映射破坏同源判定。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
