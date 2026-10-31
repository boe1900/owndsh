# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

web-mcp.test.mjs: 0.2.1-rc.5 真实 Web/AgentLoop 回归，复制已安装 profile，以本地模型/MCP/OAuth 桩覆盖分页、无工具资源服务器、未声明 resources 能力的服务器、英文 tool_search 累加/去重/下一轮生效/Agent 隔离、中文查询无匹配、凭据重启恢复和官方 Plugins → Discover 入口；`OWNDSH_E2E_TOOLS_MODE` 接受 `native`/`ptc`，`OWNDSH_E2E_SCENARIO=structured` 另跑 outputSchema、structuredContent、PTC A→B 字段传递、无 schema 对象和 isError；证据写入 `OWNDSH_E2E_OUTPUT`。
desktop-auth.test.mjs: 消费显式 OWNDSH_TEST_RUNTIME 的 macOS/Chromium 认证闭环，验证闲置零请求、过期续期、网络恢复与设备撤销；使用隔离 profile。
skill-desktop.test.mjs: 消费显式 OWNDSH_E2E_LAUNCH_URL/OWNDSH_E2E_SCENE 的真实 Host 技能页现场，覆盖技能 Tab、已安装条件筛选、分类筛选、搜索、安装、启用/禁用、编辑/打开文件夹/卸载、卸载后回到发现和安装恢复；保存技能页截图与 result.json，不接管或清理调用方现场。

t01-harness-smoke.mjs: T01/T06/T14 真实组合验收器，将零业务配置 bundle 安装到锁定临时 profile，验证 `UNCONFIGURED`、Server API/settings 持久化、Client bundle、本地状态/无 SSE 与上游清洁度。
t02-contract-consumer.mjs: T02 真实包验收器，把 contracts tgz 安装到全新临时 consumer，验证公开 ESM、品牌构造、严格错误解码和协议 hash。
t06-platform-client-consumer.mjs: T06 真实包验收器，安装 platform-client/contracts tgz 后验证 built-lib 导入、非秘密 installation 与无 ambient/Harness 源码依赖。
t07-browser-harness.mjs: T07 真实浏览器组合载体，以零业务配置临时 profile 启动可控回环假平台与锁定 Harness，覆盖 Server 设置、全局门禁、READY、认证过期和设备撤销。
t11-harness-model-smoke.mjs: T11 真实模型组合验收器，验证 bundle caret peer 安装，并在临时 Harness web profile 通过官方 ctx.llm 与 Agent 恢复层覆盖动态目录、default、三协议流、xhigh、瞬时 503 重试、终态 quota 零重试、错误矩阵与无本地上游 Key；实际运行版本以 Harness 锁定文件为准。
t12-skill-provider-acceptance.mts: 锁定 DSH v0.2.1-rc.5 的 skill provider 门禁，验证 OwnDsh custom 根目录隔离、Desktop `standard`/`ptc` 双 provider 组成、同名 scope 裁决、官方 watcher 失效以及四种 frontmatter 调用策略；只操作临时目录，Desktop patch checkout 缺失时明确报告跳过。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
