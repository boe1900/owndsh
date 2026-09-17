# mcp/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseMcpConfiguration.java: MCP JDBC store 与 application service 的 Spring 装配，并注入既有 AuditSink。
domain/McpServer.java: tenant 内公共 MCP Streamable HTTP 配置与状态不变量，校验 none/API Key/OAuth 预注册与 dynamic public client union；OAuth 接受 HTTP(S) 完整地址并拒绝 userinfo/片段；单密钥只声明 Header，公共 headers 禁止大小写重复、认证覆盖与协议保留头。
domain/McpGrant.java: ALL/USER/GROUP 授权记录，ALL/null 与指定主体正 ID 不变量。
application/McpService.java: server CRUD/CAS、assignment 与 catalog；授权创建/启停/删除及 bootstrap revision 同事务，noop 不递增，旧 revision 冲突；管理写入追加脱敏审计。
application/McpResourceNotFoundException.java: MCP 当前 tenant 中查无资源到统一 HTTP 404 的无敏感字段信号。
application/McpIdempotencyConflictException.java: 同一 MCP 幂等键复用不同请求摘要时的稳定 409 信号。
application/McpChangeMetadata.java: CONFIG_CHANGED action 的 MCP 脱敏操作 metadata 白名单。
persistence/McpStore.java: MCP 持久化 DIP 端口。
persistence/JdbcMcpStore.java: PostgreSQL adapter；主体锁及授权行锁/CAS 保证并发写入；GROUP 复用手工/身份源成员，exists 求并集。
persistence/McpIdempotencyRecord.java: MCP 创建幂等占位与完成资源 ID 的只读事实投影。
web/McpServerRequest.java: 管理端写入 DTO。
web/McpViews.java: server/grant/snapshot 安全投影，ID 以字符串输出，不回传 tenant/创建者内部字段。
web/McpRequestFingerprint.java: 使用 RFC 8785 JCS 与 SHA-256 生成稳定管理请求摘要。
web/AdminMcpController.java: 管理端 server CRUD 与状态 API，复用 tenant cursor 和 items/page envelope。
web/RuntimeMcpController.java: 端侧 assignments bootstrap API。
web/AdminMcpGrantController.java: read 分页、最多 100 条 grant 原子创建与 If-Match 启停/删除，复用 UUIDv4 请求键和删除响应。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
