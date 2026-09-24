<!--
[INPUT]: DSH 0.1.7-alpha.1 npm runtime、OwnDsh beta.8 发布包、隔离 Web profile 与本地 MCP/OAuth/企业平台协议桩。
[OUTPUT]: 记录 0.1.7-alpha.1 对 OwnDsh 的行为验收、发布元数据限制与未覆盖范围。
[POS]: dsh-compatibility.md 的本次升级证据；不改变插件实现，也不把局部 E2E 扩大成完整发布承诺。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 0.1.7-alpha.1 兼容性验收

日期：2026-09-23。目标版本为 [dsh-v0.1.7-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1)，上游 tag commit 为 `c36a83ff6bb95e3f82cf79f9be7c724270a8aa61`。

## 结论

已记录的 Web/MCP 行为在 DSH 0.1.7-alpha.1 上通过了本次验收。MCP 按需加载、官方 SDK v2 OAuth、资源与 URI 模板、工具分页、协议协商、无工具服务器、OAuth 失效恢复、插件入口和 Host 重启恢复均未发现运行时断点。

当前工作树已将 DSH peers、开发依赖和官方 `pluginManager` 接入统一到 `0.1.7-alpha.1`，不再保留 alpha.2 的安装兼容分支。新增的本地模块回归覆盖官方安装/更新/卸载结果、重启标记和 Desktop 重启接缝；本报告中的浏览器制品仍是当时的 beta.8，不能替代本次发布包 E2E。

## 验证环境

| 项目 | 实际值 |
|---|---|
| OwnDsh 制品 | `owndsh-plugin@0.1.0-beta.8`，使用正式 tgz；SHA-512 `iLAxUTKKp/kxgfPs6gThFWwTfJwp2gt5xua7Q70KxRCtCtmt8KCRoFKktRXCg4k5aSXTNS7mKlXXZhy8mUHMuA==` |
| DSH runtime | `@deepseek-ai/dsh@0.1.7-alpha.1`，npm tarball integrity `sha512-fim76775kLyal0lLNmpktZfOiOwU0P9qdluknL5Sm3F6ax9I5PcLD0W0WzqH9tMOOY8yHya5VShuEzSSh223sw==` |
| 官方 MCP 包 | `@deepseek-ai/dsh-mcp-client@0.1.7-alpha.1`、`@deepseek-ai/dsh-mcp-resources@0.1.7-alpha.1`、`@modelcontextprotocol/client@2.0.0` |
| 其它命中包 | `@deepseek-ai/dsh-llm-pi-ai@0.1.7-alpha.1`、`@deepseek-ai/dsh-settings@0.1.7-alpha.1`、Cordis `4.0.3`、Schemastery `3.18.3` |
| 运行面 | 隔离 `DSH_HOME`、DSH Web、Chromium、回环企业平台/MCP/OAuth 服务；模型响应和 OAuth 服务均为确定性本地桩。为避开无关的可选语音包下载，显式补齐了当前 macOS x64 所需的两个 DSH native binding；未测试语音转写。Desktop 原生封装未用 `0.1.7-alpha.1` 运行树验收。 |
| 证据目录 | `/tmp/owndsh-dsh017-e2e-20260922-final5`；其中 `result.json` 保存请求、OAuth 事件和模型工具快照 |

## 结果

| 检查 | 结果 | 证据 |
|---|---|---|
| CLI 安装 beta.8、生成 web profile、`--dump-config` | 通过 | 0.1.7 CLI 正确展开 OwnDsh patch；`mcp-resources` 由官方 base 提供；官方 `ui-plugin-manager` 被 OwnDsh patch 禁用 |
| 企业 Web 登录、OwnDsh 插件市场入口 | 通过 | 官方“插件”入口隐藏，OwnDsh 设置中的企业插件市场仍可访问 |
| none/API Key/OAuth MCP 连接 | 通过 | 4 个本地服务器连接；OAuth discovery、PKCE、authorization code 和回环回调完成 |
| 协议协商、分页、资源-only server | 通过 | `server/discover`、旧协议 fallback、两页 `tools/list`；资源-only server 未收到 `tools/list` |
| MCP 资源与 URI 模板 | 通过 | `resources/list`、`resources/templates/list`、`resources/read` 对 resource-only 和 OAuth server 均成功 |
| 按需加载 | 通过 | cold/search/累加/去重/release/同回合已呈现调用/跨服务器调用均通过 |
| OAuth 401、refresh token、`invalid_grant` | 通过 | 401 刷新轮换成功；`invalid_grant` 阻止失效调用并显示重新授权；同一会话重新授权后恢复 |
| 禁用/启用与 Agent 隔离 | 通过 | 已有 Agent 撤回工具后不再呈现；重新启用有效；新 Agent 不继承旧加载集合 |
| Host 重启恢复 | 通过 | 企业凭据和 MCP OAuth 凭据恢复，未重复浏览器授权 |

完整结果为 9 组通过；真实 MCP 方法计数、模型请求工具快照和 OAuth 事件见证据目录的 `result.json`。

## Release notes 对照

- 官方 DeepSeek adapter 改为 Messages-only 不会造成 OwnDsh 插件装载断点：插件使用 `dsh-llm-pi-ai`，并通过 patch 禁用 `llm-deepseek`。但这条结论不适用于企业模型的 provider 语义；`DEEPSEEK_OFFICIAL` 仍必须跟随官方 API，不能继续默认 OpenAI Completions。RC1 复核已在 V36 将官方 provider 迁移为 `anthropic-messages` 与 `/anthropic` 根地址。
- `dsh-mcp-client`、`dsh-mcp-resources` 和 SDK v2 的协议协商、分页、资源读取在真实 Web AgentLoop 中工作；静态核对目标 `dsh-mcp-client` 的 exports 和类型也未发现 OAuth provider 接管层，因此 OwnDsh OAuth 仍只实现 SDK 要求的 provider、凭据记录、系统浏览器和回环回调宿主接缝。
- Profile 插件配置 settings、官方插件管理页以及配置/插件加载变化均未破坏 OwnDsh 当前 patch 和自有设置入口；企业插件的官方 `pluginManager` 安装/更新/卸载由模块回归覆盖，Web 内置浏览器默认值本次未单独验收。
- Session 日志 V4、仅保存于自定义事件的附件导出、Agent preset 迁移、Desktop 原生外壳、真实供应商和真实 PTC 解释器未在本次验证，因此保持未验证。

## 发布限制与下一步

本报告支持“记录的 Web/MCP 场景在目标 runtime 上可运行”，并结合当前工作树的 peer/模块验证支持 `0.1.7-alpha.1` 的代码兼容性结论。正式发布前仍应使用本次生成的 tgz 在目标 Web 与 `0.1.7-alpha.1` Desktop 运行树各跑一次 E2E；当前机器已有桌面封装仍是 `0.1.6-alpha.2`，不能代替后者。
