# packages/

> L2 | 父级: ../CLAUDE.md

成员清单

bundle/: 可发布的自包含 Harness 组合包，聚合 Host、企业模型覆盖、Session 同步、本地 API 和 Client bundle。
contracts/: OpenAPI 生成的 DTO/Zod schema、品牌 ID、错误解码与跨语言 fixture 门禁。
llm-gateway/: 官方 rc.7 LlmAdapter，提供动态目录/default、中心模型流、错误映射、取消和注册刷新。
platform-client/: `ctx.enterprisePlatform` Service，独占内存 Token、PKCE/enroll/bootstrap、状态订阅、认证请求与同源 JSON/SSE。
plugin-distribution/: `ctx.enterprisePluginDistribution` Service，提供制品双重校验、官方 CLI argv、原子状态、重启确认、库存与回滚。
session-sync/: 基于官方 rc.7 Session/Persistence 的 dirty queue、确认游标、远端复制与新 ID 恢复 Service。
ui/: 基于 `dsh.client` 与官方 Settings/sidebar/onboarding slots 的桌面员工账号、受管插件浏览器半边。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
