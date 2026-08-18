# packages/

> L2 | 父级: ../CLAUDE.md

成员清单

bundle/: 可发布的自包含 Harness 组合包，聚合 Host、本地 API、Session 恢复和 Client bundle。
contracts/: OpenAPI 生成的 DTO/Zod schema、品牌 ID、错误解码与跨语言 fixture 门禁。
llm-gateway/: OpenAI-compatible SSE 传输刺探，锁定错误、断流与取消语义。
platform-client/: `ctx.enterprisePlatform` Service，独占内存 Token、PKCE/enroll/bootstrap 状态机与 `ctx.webServer.register()` 同源 JSON/SSE。
session-sync/: 基于官方 Session seed/create/flush 的本地恢复副本事务。
ui/: 基于 `dsh.client` 与官方 UI slots 的浏览器半边。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
