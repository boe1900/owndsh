<!--
[INPUT]: npm dsh 0.1.6-alpha.2、当前插件 tgz、Chromium 与本地平台/MCP/OAuth/模型服务的真实 Web 组合证据。
[OUTPUT]: 兼容性结论、修复、可复现入口与尚未覆盖的边界。
[POS]: alpha.2 升级验收记录；区分真实 Host/浏览器/AgentLoop 与受控外部服务，不能替代生产提供商验收。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 0.1.6-alpha.2 Web / MCP 验收

2026-09-22：修正版 9 组 Web 场景通过；MCP runtime、OAuth、bundle 回归 35 条通过，UI 回归 33 条通过，正式构建与打包通过。按需加载、显式释放、Agent 隔离和正常 OAuth 连接未发现回归。MCP 尚未上线，只维护当前凭据格式，不加入旧开发版本的兼容和迁移逻辑。

运行面为 npm `@deepseek-ai/dsh@0.1.6-alpha.2`、Node 24.14.1、Chrome 153、正式 `owndsh-plugin-0.1.0.tgz`。脚本复制已安装 profile 后运行，平台、MCP、OAuth 和模型全部使用本机 HTTP 协议桩；浏览器页面、PKCE 回环、SDK transport、官方 AgentLoop 和模型 adapter 使用发行实现。系统 URL opener 将授权地址交给测试浏览器，没有操作真实第三方账号。

## 通过项

| 场景 | 证据 |
|---|---|
| 企业登录 | 页面登录、PKCE、设备登记、bootstrap 到 READY；登记版本精确为 alpha.2 |
| 插件入口 | 官方侧栏“插件”入口消失；OwnDsh 设置中的企业插件市场可打开并显示目录空态 |
| MCP 连接与分页 | none、原样 API Key、OAuth 均连接；两页 tools/list 合并为两个工具 |
| 协议协商与无工具服务器 | SDK 先发 server/discover，收到 -32601 后回退 initialize，后续使用协商后的 2025-03-26；resourceonly 不声明 tools，也未收到 tools/list |
| 按需加载 | 首次模型请求无受管 MCP schema；搜索 echo 后只出现 echo，再搜索 write 后两者累加；重复搜索没有重复定义 |
| 释放与本步快照 | 同一步 release echo 后调用已呈现的 echo 成功；下一步只保留 write；实际 HTTP tools/call 记录吻合 |
| MCP resources | 官方三个共享工具真实调用 resourceonly 和 OAuth 服务的资源列表、URI 模板与读取；展开模板后的 URI 得到正文 |
| OAuth 刷新/失效/恢复 | 401 后 SDK refresh rotation 成功；invalid_grant 后被拒绝的工具未在服务端执行、下一步 schema 撤回、设置显示需要重新授权；重新授权后原会话搜索并调用成功 |
| 禁用/启用/隔离/重启 | 禁用后原会话不再发送 docs schema，普通聊天继续；启用恢复连接；新 Agent 无前一会话的加载集合；Host 重启后平台及 OAuth 凭据自动恢复，无新增浏览器登录 |

完整浏览器流程共 17 次模型 HTTP 请求，服务端完成 7 次业务工具调用。测试对真实模型请求中的工具名称逐步断言，模型输出本身是确定性的协议桩，不证明真实模型一定会选择正确工具或主动释放。

## 本轮修复

1. 删除重复插入的 `mcp-resources` row，复用 alpha.2 base 的官方实现；重复 row 曾阻止真实 Web 启动。bundle 回归固定“不得重复插入”。
2. 补齐官方 `saveDiscoveryState()/discoveryState()` 宿主存储。SDK 此前警告无法执行 SEP-2352 回调阶段授权服务器绑定；现在 discovery 与 verifier 同属 manager 内存生命周期，由 SDK 使用和失效，未引入 OwnDsh discovery 协议实现。最终 Web 验收断言该警告不再出现。

## 已知差异与覆盖边界

- 当前 SDK 格式凭据已验证可重启恢复；旧开发版本数据不在兼容范围内。
- invalid_grant 时，SDK 会尝试交接浏览器授权；未完成该交互的在途调用本次以 `Error: Request timed out` 结束（测试 toolCallTimeoutMs 为 5000）。设置页随后显示“需要重新授权”，原会话可恢复。明确的即时授权失效错误提示仍可改进。
- SDK 会在 401 后刷新并重试请求。OwnDsh 没有额外实现重放，但旧版“401 一定不重放”描述不再适用。
- 本次验证本机 Web、native 工具模式；PTC/both/TS/Python 由现有集成回归覆盖，未运行真实 PTC 解释器或完整 Desktop E2E。
- 企业插件市场本次验证入口和读取；未重新执行 npm 安装/卸载全链路，也未启用智能体团队。禁用 ui-plugin-manager 只移除该页面及其交互入口，Host/plugin manager 配置仍保留；不能把这一项当作团队功能验收。
- 未验证真实 Notion/其它供应商、手工 OAuth endpoint、动态注册、远端浏览器回调或生产 Server。这些边界不由本地协议桩结果推定兼容。

## 复现和制品

入口：`plugin/scripts/web-mcp.test.mjs`。`OWNDSH_TEST_RUNTIME` 指向含 npm Harness 的目录，`OWNDSH_TEST_PROFILE` 指向已安装当前 tgz 的 web profile 目录；脚本复制 profile，并校验其 Host bundle SHA-256 等于工作树构建产物。相同版本 tgz 重新安装可能命中 pnpm 旧缓存，本轮使用不同临时 tgz 路径安装后再比对内容。

```sh
cd plugin
OWNDSH_TEST_RUNTIME=/tmp/owndsh-web-alpha2.hll71M \
OWNDSH_TEST_PROFILE=/tmp/owndsh-web-alpha2-e2e-profile.rwUW8M/profiles/web \
OWNDSH_PLAYWRIGHT_MODULE=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright/index.mjs \
OWNDSH_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/web-mcp.test.mjs
```

最终 Host bundle SHA-256：`894ed0df437fe180932d4cce5f07c1b673de04331b9ebc4bc36610b62eaebdd2`。

产物为 `artifacts/owndsh-plugin-0.1.0.tgz`。机器证据在 `plugin/scripts/.build/web-mcp/result.json`；截图为同目录 `mcp-connected.png`、`oauth-invalid-grant.png`、`chat-tools.png`。本轮成功证据以 result.json 为准，同目录 failure.* 是调试期间的历史失败，不是最终结果。测试结束已关闭自己启动的 Host、浏览器和协议桩；保留隔离 profile 供复查，未发布 npm、未替换日常 Desktop 安装。
