<!--
[INPUT]: 当前 owndsh-plugin bundle、DSH 0.2.0-rc.1 Web runtime、隔离 Web profile、本地平台/MCP/OAuth/模型协议桩。
[OUTPUT]: MCP 普通链路与 structuredContent 结构化组合的真实 Web/AgentLoop 验收入口、场景矩阵、断言和执行证据。
[POS]: MCP Pi exposure/retrieval 迁移后的专项验收报告；不把旧 alpha.2 制品或受控 PTC 单测冒充当前 Web 证据。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# MCP Web / 结构化结果验收

日期：2026-10-01

本报告对应 `plugin/scripts/web-mcp.test.mjs` 的当前实现。脚本启动真实 DSH Web、Chromium、OwnDsh bundle 和官方 AgentLoop；平台、模型、MCP、OAuth 均为 `127.0.0.1` 协议桩。profile 必须安装当前构建的 bundle，脚本会比较安装包与工作树的 Host bundle SHA-256。

## 执行入口

准备 `@deepseek-ai/dsh@0.2.0-rc.1` 的 runtime 和安装当前 tgz 的 Web profile 后，在 `plugin/` 运行：

```sh
OWNDSH_TEST_RUNTIME=/absolute/path/to/runtime \
OWNDSH_TEST_PROFILE=/absolute/path/to/profile-home/profiles/web \
OWNDSH_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
OWNDSH_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
OWNDSH_E2E_OUTPUT=/absolute/path/to/evidence \
node scripts/web-mcp.test.mjs
```

普通回归默认使用 `OWNDSH_E2E_TOOLS_MODE=native`。结构化专项需要额外设置场景和模式：

```sh
OWNDSH_E2E_SCENARIO=structured OWNDSH_E2E_TOOLS_MODE=native node scripts/web-mcp.test.mjs
OWNDSH_E2E_SCENARIO=structured OWNDSH_E2E_TOOLS_MODE=ptc node scripts/web-mcp.test.mjs
OWNDSH_E2E_SCENARIO=structured OWNDSH_E2E_TOOLS_MODE=both node scripts/web-mcp.test.mjs
```

`OWNDSH_E2E_SCENARIO=structured` 只执行结构化专项，避免重复登录和 OAuth 生命周期；未设置时执行普通 MCP 全链路。每次运行会在 `OWNDSH_E2E_OUTPUT` 写入 `result.json`，失败时写入 `failure.json`、`failure.txt` 和 `failure.png`。

## 场景矩阵

| 场景 | native | ptc | both | 关键断言 |
|---|---:|---:|---:|---|
| 普通 MCP 连接与发现 | ✓ | — | — | native 普通流程覆盖 none/API Key/OAuth、分页 `tools/list`、resource-only 不调用 `tools/list` |
| tool_search 按需加载 | ✓ | ✓ | ✓ | native 直接调用；ptc/both 在结构化 `run_code` 中调用，搜索结果下一轮生效，重复搜索去重，同轮搜索出的工具不能立即调用 |
| structuredContent A→B | ✓ | ✓ | ✓ | native 从上一步工具文本读取 `user-1`；ptc/both 在 `run_code` 直接读取 `user.structuredContent.id`；三种模式的 HTTP 桩都实际收到 `userId=user-1` |
| 无 outputSchema | ✓ | ✓ | ✓ | `unknown_record` 的 `structuredContent` 对象保留，不被降级为文本 |
| MCP isError | ✓ | ✓ | ✓ | native 走 DSH 失败契约；PTC `try/catch` 能捕获，未捕获错误不会被当作成功 |
| OAuth/暂停/隔离/重启 | ✓ | — | — | 当前普通 Web 流程覆盖 401 refresh、`invalid_grant`、禁用/启用、新 Agent 冷启动、Host 凭据恢复 |

`ptc` 的结构化脚本先通过 `tools.tool_search` 发现工具，下一次 `run_code` 执行：

```ts
const user = await tools.mcp__structured__lookup_user({ email: 'user@example.com' })
const updated = await tools.mcp__structured__update_user({
  userId: user.structuredContent.id,
  status: 'verified',
})
```

`both` 同时保留 native 工具声明和 `run_code`，结构化断言使用同一 PTC 编排路径。native 的模型消息是工具结果文本，不能把它当成模型可直接访问的 JavaScript 对象；对象字段访问由 PTC/both 的 `run_code` 提供。模式差异只在模型可见通道，不改变 MCP 返回值或字段语义。

## Fixture 契约

结构化 MCP 桩暴露四个工具：

- `lookup_user`：有 `outputSchema`，返回 `structuredContent: { id: 'user-1', status: 'ready' }`。
- `update_user`：有 `outputSchema`，要求并记录 `userId`，返回 `{ ok: true, userId: 'user-1' }`。
- `unknown_record`：没有 `outputSchema`，返回 `{ kept: true, id: 'user-1' }`。
- `fail_user`：返回 `isError: true`，验证 DSH 失败与 PTC 异常路径。

模型协议桩逐轮断言工具列表、PTC SDK 文本和工具结果；MCP HTTP 桩逐次断言输入参数。native 通过官方工具 bridge 保留 outputSchema，ptc/both 另外验证 renderer 得到可编排的返回类型。因此“字段类型进入 SDK”与“真实下游收到字段值”同时受检，不能只靠 snapshot 或受控 binding 通过。

## 已执行证据

在当前工作树已执行：

```sh
cd plugin
pnpm --filter owndsh-plugin exec vitest run tests/mcp-runtime.spec.ts tests/mcp-pi-search.spec.ts
node --check scripts/web-mcp.test.mjs
```

结果：MCP runtime/Pi 检索 `2 files, 19 tests passed`；Web E2E 脚本语法检查通过。此前 DSH 0.2.0-rc.1 普通 Web 基线记录在 [dsh-020-rc1-compatibility-20260929.md](dsh-020-rc1-compatibility-20260929.md)，包括登录、连接、搜索、OAuth、禁用/启用、Agent 隔离和重启；该记录不包含本报告新增的 structured 场景。

本轮真实 Web 运行使用 DSH `0.2.0-rc.1`、OwnDsh bundle SHA-256 `26dead49fdcc137e863d821d1eb4984ee53388c2b19b13a5301f9fba87a0be07`、固定 `zh-CN` locale，并全部通过：

- 普通 native 全链路：`.tmp/mcp-pi-e2e/evidence-web-native-rerun4/result.json`，10 项检查通过。
- structured native：`.tmp/mcp-pi-e2e/evidence-structured-native-final2/result.json`，4 项检查通过。
- structured ptc：`.tmp/mcp-pi-e2e/evidence-structured-ptc-final/result.json`，4 项检查通过。
- structured both：`.tmp/mcp-pi-e2e/evidence-structured-both-final/result.json`，4 项检查通过。

各结果文件同时记录 MCP HTTP 方法、模型每轮可见工具、工具结果和 bundle hash；失败时脚本会写入 `failure.json`、`failure.txt` 和 `failure.png`。当前仓库不把旧 `plugin/scripts/.build/web-mcp/result.json` 作为本轮证据，因为该文件来自 alpha.2 历史运行。

## 结论边界

这组场景验证 MCP `outputSchema` 和 `structuredContent` 能穿过官方 client、OwnDsh tool bridge、DSH schema/SDK renderer 和实际 AgentLoop；其中 PTC/both 支持代码直接读取 A 工具对象字段并传给 B，native 只验证文本结果可被模型继续使用。它不推断任意两个 MCP 的字段业务含义，也不验证真实第三方 MCP 服务；第三方兼容性仍需替换本地桩后单独验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
