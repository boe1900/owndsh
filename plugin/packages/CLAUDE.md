# packages/

> L2 | 父级: ../CLAUDE.md

成员清单

bundle/: 可发布的自包含 Harness 组合包，聚合 Host、企业模型覆盖、本地 API、受管插件和 Client 门禁；V1 不启动 Session 同步。
contracts/: OpenAPI 生成的 DTO/Zod schema、品牌 ID、错误解码与跨语言 fixture 门禁。
llm-gateway/: 官方 `dsh-llm-pi-ai` 的企业 profile 与本机认证代理桥，提供三协议动态目录/default，不实现模型协议。
platform-client/: `ctx.enterprisePlatform` Service，使用官方 settings 持久化 Server 地址，并独占内存 Token、PKCE/enroll/bootstrap、认证请求与同源 JSON/SSE。
plugin-distribution/: `ctx.enterprisePluginDistribution` Service，提供制品双重校验、官方 CLI argv、原子状态、重启确认、库存、回滚与显式整包卸载。
session-sync/: 基于官方 rc.2 Session/Persistence 的 dirty queue、确认游标、远端复制与新 ID 恢复 Service。
ui/: 基于 `dsh.client` 与官方 Settings/sidebar/shell.overlay slots 的 Server 配置、全局登录门禁、账号和受管插件浏览器半边。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
