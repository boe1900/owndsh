/**
 * [INPUT]: 依赖 OwnDsh Desktop 内 Harness 0.2.1-rc.5 ptc 运行时（@deepseek-ai/dsh-ptc-runtime-node）的 run_code SDK、
 *          owndsh-plugin 已连接的 Notion MCP（69 工具，公开名前缀 mcp__notion__）、tool_search BM25 检索绑定
 * [OUTPUT]: 对外提供 MCP codemode/ptc 档实机验收结论：SDK 基线、检索 loaded/truncated、codemode 调用、并行组合、
 *           门禁负例、错误契约、声明面交叉的 PASS/FAIL 判定与原始证据
 * [POS]: docs 的 MCP 通道验收证据成员，与 t14/t15（插件客户端）、dsh-compatibility（升级契约）同层；
 *        是 native 模式 MCP 验收的对照面，回答 8 工具曝光归属待解问题
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

# MCP codemode/ptc 档实机验收（2026-11-03）

- 环境：OwnDsh Desktop，Harness 0.2.1-rc.5 + owndsh-plugin，Notion MCP 已连接（公开名前缀 mcp__notion__）
- 运行时：Node v24.21.0 / darwin；SDK 渲染语言 TypeScript（interface + 类型标注被剥离后正常执行）
- 全程只读：未调用任何 create-*/update-*/delete-*/restore-*/set-* 开头的 Notion 工具（写类工具仅做 `typeof` 存在性检查，从未调用）
- 会话模式判定：**纯 codemode/ptc 档**。原生函数表仅 run_code 与 tool_search 两个声明，全程未出现任何原生 MCP 声明面

## PASS/FAIL 汇总

| # | 步骤 | 判定 | 关键证据 |
|---|------|------|----------|
| 1 | 环境确认：run_code 存在 | PASS | 本报告全部程序均由 run_code 执行；SDK 语言 TypeScript |
| 2 | SDK 检索前基线 | PASS（记录项） | 绑定总数 112 = notion 69 + harness 43；mcp__notion__ 绑定检索前即全量存在 |
| 3 | tool_search 正式检索 | PASS | A/B 两次返回 loaded+matches+truncated 结构 |
| 4 | codemode 调用命中工具 | PASS | notion-search "Get Started" 命中 5；notion-fetch 按 id 取回 title="Get Started" |
| 5 | Promise.all 并行组合 | PASS | get-self + get-users 并行，workspace="hhhhb"、成员数=2，中间结果仅在代码侧合并 |
| 6 | 门禁负例：未检索工具 | **FAIL（关键发现）** | 从未检索的 list-recent-pages / list-private-pages 均可直接调通；ptc 无检索门禁 |
| 7 | 错误契约 | PASS | 上游原样 validation_error / HTTP 400 / "Invalid agent URL" |
| 8 | 声明面交叉（仅 both） | N/A | 纯 ptc 档，无原生 MCP 声明面 |

## 重点断言

1. **MCP_CODEMODE_UNAVAILABLE**：全程未出现 —— PASS。所有 MCP 调用均经代码通道真实触达 Notion。
2. **未检索工具不可从代码通道调用**：**FAIL**。ptc 模式把整个 MCP 目录（69 个 mcp__notion__ 绑定）在 SDK 基线全量预绑定，
   `typeof` 为 function 且可直接执行（list-recent-pages 响应 874 字节真实页面数据；list-private-pages 存在且为 function）。
   结论：**codemode 档不存在 deferred 检索门禁，检索门禁只存在于 native 声明面**。

## 8 工具曝光归属（待解问题 → 已解）

native 会话首轮曾原生声明 8 个：get-self / get-tool-access / convert-page-to-skill / stop-session / get-session-status /
wait-session / send-message-to-session / read-session-event。本次 ptc 基线对账：8 个全部以 `mcp__notion__notion-*`
形式存在于 SDK（遍历 69 键逐一 hasOwnProperty 实测），且**其余 61 个也在**。归属结论：那 8 个的曝光属于 **native 声明面**；
ptc/codemode 档不继承 native 的 8 工具子集，而是走全量目录预绑定。目录规模也大于预估（69 实测 vs 约 40 预估），
含 calendar-*（8）、session 类、skill 类、suggested-edit 类等新家族。

## SDK 基线（检索前）

- 绑定总数 112：mcp__notion__notion-* 69 个 + harness 绑定 43 个（advanced_search/bash/read/write/edit/grep/glob/tool_search 等）
- `typeof tools.run_code` = undefined（run_code 不自暴露）；`typeof tools.tool_search` = function
- 参照 8 项逐一对账：全部存在（mcp__notion__notion-get-self / -get-tool-access / -convert-page-to-skill / -stop-session /
  -get-session-status / -wait-session / -send-message-to-session / -read-session-event）
- 检索后快照：绑定总数仍 112（69+43），deferred 生效不改变代码通道绑定面

## 检索结果（STEP 3）

- Search A：`{ query: "search pages databases content", limit: 8 }`
  - loaded(8)：notion-search / list-shared-pages / list-private-pages / move-pages / update-page / list-recent-pages / get-tool-access / search-sessions
  - truncated=false；结构键 = loaded/matches/truncated
- Search B：`{ query: "current user workspace members", limit: 8 }`
  - loaded(8)：get-users / search-agents / get-self / convert-page-to-skill / list-favorite-pages / duplicate-page / get-teams / update-enabled-skills
  - truncated=false

## codemode 调用（STEP 4/5）

- notion-search `{ query: "OwnDsh" }` → 0 命中（工作区确无该词，符合预期，非故障）
- notion-search `{ query: "Get Started" }`（关键词取自 list-recent-pages 真实标题）→ 命中 5：
  Get Started(af4bf0a4-3155-484c-81eb-7f7924c471b7)、Untitled×2、333、3333
- notion-fetch `{ id: "af4bf0a4-…" }` → title="Get Started"、metadata.type=page、顶层键 metadata/title/url/text/cover/icon/verification/page_last_edited_at
- 字段来源实测：该 MCP 服务器不返回 structuredContent，统一走 content[0].text 内嵌 JSON 解析
- Promise.all(get-self, get-users)：workspace="hhhhb"，user="b hhhh"，成员数=2（首成员 "b hhhh"）

## 错误契约与错误码（原样记录）

- `limit=9` → 错误文本 `MCP_SEARCH_INVALID`（逐字命中）
- 中文查询 probe（"中文查询应被拒绝", limit=3）→ **未报错**（与"仅英文"预期不符，记录为偏差；limit 校验真实存在）
- 省略参数调用 get-self → `binding arguments must be lossless JSON`（ptc 运行时参数契约，须显式 `{}`）
- convert-page-to-skill 首次传 `{ url }`（参数名错误）→ `Input validation error: Invalid arguments for tool notion-convert-page-to-skill: page_url: Invalid input: expected string, received undefined`（真实参数名 page_url）
- convert-page-to-skill `{ page_url: "probe-invalid-url" }` → 上游 400 原样：
  `{"name":"APIResponseError","code":"validation_error","status":400,"body":"…Invalid agent URL: \"probe-invalid-url\" looks like an invalid compressed URL or shorthand identifier. Expected a Notion page or block URL.","additional_data":{"tool_error_code":"invalid_input","tool_error_class":"validation","tool_error_retryable":"false",…}}`
  —— 异常被 try/catch 捕获，脚本继续执行，Notion 侧无副作用

## 门禁负例原始输出（STEP 6）

- `[GATE-PRE] typeof mcp__notion__notion-search = function` → 零检索直接调用 → 真实触达 Notion，返回 `{"results":[],"type":"workspace_search"}`（空结果，只读）
- `[GATE] typeof mcp__notion__notion-list-recent-pages = function` → 调用成功，响应 874 字节，含真实页面 URL（app.notion.com/p/33681444a28380829…）
- `[NEGATIVE] mcp__notion__notion-list-private-pages in Object.keys(tools) => true；typeof => function`（两次检索均未命中该工具，从未被 loaded）
- 写类工具存在性：create-pages / delete-pages / update-page 均 typeof=function（仅检查，从不调用）

## 声明面（STEP 8）

- 原生函数表全程仅 run_code + tool_search；检索命中下一轮亦无任何原生 MCP 声明出现 → 纯 ptc 档，非 both 模式

## 工作区写入边界

本验收仅写入本文档与 docs/CLAUDE.md 成员清单一行；未触碰工作区其他文件，未对 Notion 做任何写操作。
