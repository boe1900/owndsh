<!--
[INPUT]: DSH 0.2.0-rc.1 官方 tag/npm runtime、OwnDsh beta.15 本地制品与隔离验证日志。
[OUTPUT]: 记录兼容门禁根因、目标版本适配、实际验收结果和未覆盖范围。
[POS]: dsh-compatibility.md 的 0.2.0 RC1 升级证据；源码差异、模块测试、Host 验证和发布状态分别记录。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 0.2.0-rc.1 兼容性验收

日期：2026-09-29。目标为官方 [dsh-v0.2.0-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1)，tag commit `4878cdabd87d4041bdaff61d04c966883b9fd07a`。OwnDsh 基于 `f8e8ca2` 加本轮适配，制品版本 `0.1.0-beta.15`。本报告记录本地构建与验收；正式制品由 `v0.1.0-beta.15` 标签触发 CI 检查、构建并发布至 npm `next`。

beta.15 通过目标 Host 的兼容门禁、启动和下述 Web/MCP 主链路。结论限于本轮实测范围，不由 peer 范围推定其他宿主版本兼容。

## 根因与改动

beta.14 的 16 项 Harness peers 声明 `^0.1.7-rc.1`，不包含 `0.2.0-rc.1`。用目标 runtime 的 `evaluatePluginCompatibility()`、空 exemptions 复现：beta.14 返回 16 项不兼容；beta.15 返回 `undefined`，正常通过官方门禁。报错中的崩溃/数据丢失是官方版本不匹配警告，本轮没有观测到这两类故障。

1. 四个 workspace manifest 的 Harness devDependencies/peers 统一到 `0.2.0-rc.1` / `^0.2.0-rc.1`，bundle 升为 beta.15；锁文件仅替换 39 个 Harness 包，其他包版本不变。
2. 官方 base 新增 `llm-deepseek-account`。企业 profile 补上该 row 的禁用，与原有个人 API Key/pi-ai 模型策略一致；企业模型继续由官方 `dsh-llm-pi-ai` 提供。
3. Web 回归明确断言目标 runtime 版本；已有 bundle 测试覆盖新的 peer 范围与个人账号 row。

未增加兼容豁免、旧版 fallback 或插件页面 fork。企业插件仍位于 OwnDsh 设置 tab，官方插件页和自由安装入口保留。

## 上游差异核对

对比官方 `dsh-v0.1.7-rc.1` 与目标 tag 源码，而非 main 或 source map。

| 契约 | 差异与本轮处理 |
|---|---|
| D01/D02 manifest、默认 profile | 版本范围正常阻断旧包；新增个人账号 provider，补齐禁用。原 `llm-deepseek` row 指向新的 API Key 模块，row ID 保持，原 patch 仍有效。 |
| D03–D06 credentials、settings、fs、authorization | 所依赖的公开接口未发生破坏变更，类型检查与平台生命周期回归通过。 |
| D07 模型 | 官方 pi-ai 实现未变；LLM/Session 新增工具历史与 deferred loading 能力，由真实 AgentLoop 回归验证使用路径。 |
| D08–D13 MCP、tools、PTC | MCP client/resources、timeout、PTC runtime 所用契约未变；tools 增加可选 displayReason，现有门禁 hooks 保留。模块回归包含 native/PTC/both，但 PTC 使用受控 bindings。 |
| D14 Client UI | 官方 Modal 调整焦点/快捷键管理；继续消费宿主 ui-primitives，未复制或改写官方组件。 |
| D15/D16 插件管理 | 官方 pluginManager 调整进程树退出和运行记录清理，所用公开 types/API 未变；安装 OwnDsh 本次 tgz 走目标版本官方 CLI。 |

## 已执行检查

- `pnpm --dir plugin install --frozen-lockfile`：通过。
- `pnpm --dir plugin run check`：全量 TypeScript、构建、14 个 Vitest 文件的 117 条测试，以及 4 条 workspace 检查通过。
- `pnpm --dir plugin run pack:bundle`：通过；tgz 的版本、16 项 Harness peers、profile patch 与 Host/Client bundle 内容核对通过。
- 隔离 `DSH_HOME` 的官方 `plugin --profile web add --ignore-scripts <tgz>`：通过；未配置兼容豁免。pnpm 提示宿主 peer 未装进 profile；Host 从 runtime 提供共享服务，不能通过向 profile 重装 peers 消除此提示。
- 目标 Host `--dump-config`：企业默认模型正确，API Key/个人账号 provider 均禁用，官方 `ui-plugin-manager` 保留，OwnDsh row 正常插入。

Web E2E 使用真实 `@deepseek-ai/dsh@0.2.0-rc.1`、Chromium、官方 pi-ai 与 AgentLoop；平台、模型、MCP/OAuth 均为回环 HTTP 协议桩。安装包 Host hash 与当前构建比对一致，10 组场景全部通过，记录 21 次模型请求、67 次 MCP 请求：

| 场景 | 结果 |
|---|---|
| 企业浏览器登录、官方插件入口与 OwnDsh 企业目录 | 通过；Client 激活正常，企业目录可访问。 |
| HTTP MCP none/API Key/OAuth、分页与资源-only 服务 | 通过；API Key 原样传递，缺少 tools capability 的服务不收到 tools/list。 |
| 真实 AgentLoop、工具搜索与资源 | 通过；冷启动不暴露业务工具，搜索累加去重、释放、本步调用、资源/URI 模板/读取均正常。 |
| OAuth 401 与失效恢复 | 通过；官方 SDK 轮换 Refresh Token；invalid_grant 阻止失败调用，重新授权后恢复同一会话。 |
| 禁用/启用与 Agent 隔离 | 通过；禁用撤回工具，普通模型请求正常，新 Agent 不继承旧加载集合。 |
| Orama 工具召回 | 通过；自然语言、停用词、中文查询、精确服务器过滤与下一步工具注入正常。 |
| Host 重启 | 通过；企业登录与 OAuth 凭据自动恢复，不重复打开登录页面。 |

复现入口：`plugin/scripts/web-mcp.test.mjs`。`OWNDSH_TEST_RUNTIME` 指向隔离目录的 `runtime`，`OWNDSH_TEST_PROFILE` 指向 `profile-home/profiles/web`，`OWNDSH_E2E_OUTPUT` 指向 `web-e2e`；浏览器依赖使用 `OWNDSH_PLAYWRIGHT_MODULE` 与 `OWNDSH_CHROMIUM_PATH` 显式指定。脚本再复制 profile 运行，不启动用户配置。

## 制品与证据

- 制品：`artifacts/owndsh-plugin-0.1.0-beta.15.tgz`，693550 bytes。
- SHA-256：`5cbe273681d22563d2cc4dd6e93685bcd6ff8ace82ba8703c13cc1a495f25b3a`。
- 隔离目录：`/var/folders/98/dy55x_g91h7d1cz8m3q_33z80000gn/T/owndsh-dsh-020-3ulaej1g`；`compatibility.json`、`profile-install.log`、`profile-config.yml` 保留官方门禁与安装结果。
- Web 证据：上述目录的 `web-e2e/result.json`、`mcp-connected.png`、`oauth-invalid-grant.png`、`chat-tools.png`；Host bundle SHA-256 为 `3f932a3b962eebfcb4b8dcca71ce3f871d6b395ac9322319f55088fa9b48f405`。
- 检查日志：`/tmp/owndsh-020-frozen.log`、`/tmp/owndsh-020-check.log`、`/tmp/owndsh-020-pack.log`。

用户真实 profile、Server 和数据库未用于本轮验证。

## 未覆盖范围

Desktop 原生外壳、真实模型供应商/OAuth 服务、真实 PTC 解释器、智能体团队，以及企业目录内其他插件的完整安装/更新/卸载与确认弹窗未做本轮 E2E。模块测试覆盖三协议 profile/代理与受控 PTC bindings，Web 模型使用 Chat Completions 桩；这些证据不能替代真实供应商或 Desktop 验收。
