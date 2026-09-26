# packages/

> L2 | 父级: ../CLAUDE.md

成员清单

bundle/: 可发布的自包含 Harness 组合包，注入官方 credentials 并聚合 Host、企业模型覆盖、本地 API、受管插件和 Client 门禁；V1 不启动 Session 同步。
contracts/: OpenAPI 生成的 DTO/Zod schema、品牌 ID、错误解码与跨语言 fixture 门禁。
llm-gateway/: 官方 `dsh-llm-pi-ai` 的企业 profile 与本机认证代理桥，提供三协议动态目录/default，不实现模型协议。
platform-client/: `ctx.enterprisePlatform` Service，构建前先产出 contracts 依赖，使用官方 settings 持久化 Server 地址、官方 credentials 保存轮换 Refresh Token，并独占内存 Access Token 与认证请求。
ui/: 基于 `dsh.client` 与官方 main/sidebar/settings/shell.overlay slots 的 Server 配置、全局登录门禁、账号和官方插件管理页同步；企业目录只提供元数据，安装/更新/卸载统一委托官方 pluginManager。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
