<!--
[INPUT]: DSH 0.1.7-rc.1 npm runtime、OwnDsh 本地构建 bundle、隔离 Web profile 与本地 MCP/OAuth/企业平台协议桩。
[OUTPUT]: 记录 0.1.7-rc.1 对 OwnDsh 的依赖、行为验收、必要适配与未覆盖范围。
[POS]: dsh-compatibility.md 的 RC1 升级证据；不把 Web/MCP 结果扩大成 Desktop 或真实供应商承诺。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 0.1.7-rc.1 兼容性验收

日期：2026-09-24。目标版本为 [dsh-v0.1.7-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1)，上游 tag commit 为 `46a7f68b0922371ce7144b668b90e377d8e799f4`。

## 结论

OwnDsh 当前功能与 DSH `0.1.7-rc.1` 兼容。本轮没有发现需要改动 MCP 按需加载、OAuth 连接生命周期、官方插件管理 API 或 OwnDsh 自有插件市场的行为代码；必要改动集中在依赖锁定、RC1 的 Schemastery 配置读取测试、MCP client 版本上报和 Web E2E 断言。

MCP 重点链路在真实 DSH Web AgentLoop 中通过：协议协商、工具分页、资源/URI 模板、无工具服务器、none/API Key/OAuth、搜索累加去重、显式释放、本步调用、401 刷新、`invalid_grant` 重新授权、暂停/恢复、Agent 隔离和 Host 重启凭据恢复。

## 验证环境

| 项目 | 实际值 |
|---|---|
| OwnDsh 基线 | commit `5fcd3df` 与本轮工作树的 MCP 安全校验改动 |
| DSH runtime | `@deepseek-ai/dsh@0.1.7-rc.1`，隔离 runtime `/tmp/owndsh-dsh-rc1-runtime` |
| 官方依赖 | Harness 全套 `0.1.7-rc.1`、Cordis `4.0.4`、Schemastery `3.18.4`、`@modelcontextprotocol/client@2.0.0` |
| 运行面 | 隔离 `DSH_HOME`、DSH Web、Chromium、本地企业平台/MCP/OAuth 服务和确定性模型桩 |
| E2E 证据 | [`result.json`](/tmp/owndsh-dsh-rc1-e2e-8/result.json) |

## 结果

| 检查 | 结果 |
|---|---|
| 依赖安装、TypeScript、构建、workspace 检查 | 通过；135 条模块测试全部通过 |
| 企业登录、OwnDsh 插件市场、官方插件管理页禁用 | 通过；自有入口保留，官方页面入口按产品策略关闭 |
| none/API Key/OAuth MCP | 通过；认证秘密仍只进入官方 client/credentials 边界 |
| 协议协商、工具分页、资源/URI 模板、无工具服务器 | 通过；资源-only server 不强行请求 `tools/list` |
| MCP 按需加载 | 通过；cold/search/累加/去重/release/本步调用/跨 Agent 隔离均通过 |
| OAuth 恢复 | 通过；401 刷新轮换、`invalid_grant` 阻止失败调用、重新授权后恢复同一会话 |
| 启停和重启 | 通过；暂停撤回工具，恢复有效，新 Agent 不继承旧集合，Host 重启恢复凭据 |

## 五模块审计

| 模块 | 功能检查 | RC1 最佳实践 | 结论与边界 |
|---|---|---|---|
| 企业登录 | 通过；LOCAL/LDAP/OIDC、PKCE、HttpOnly 会话、失效/退出/重启恢复均有 Web/服务端门禁 | 通过；浏览器不持有 Bearer Token，Web 复用官方 settings/Host 会话，Desktop/Harness 使用官方 credentials Refresh Grant | 实现沿官方 Host 接缝收敛；真实供应商 OIDC、RC1 Desktop 原生外壳仍未验收 |
| 企业模型 | 通过；动态模型/default、三协议代理、流式响应、瞬时失败恢复和终态配额重试策略通过 | 通过；直接使用官方 `dsh-llm-pi-ai`/profile/AgentLoop，企业层只做认证代理、授权、配额和审计，不复制 provider 协议 | 结构没有补丁式第二套 AI 抽象；真实供应商矩阵与取消/网络故障仍需发布前补测 |
| 企业访问策略/配额 | 通过；组织/成员/模型集授权、TOKEN/RATE/并发窗口、Redis lease、结算恢复和重叠策略已有后端与控制台门禁 | 通过；授权解析、预留、结算和审计分层，沿 PostgreSQL/Redis 现有边界，不把额度判断塞进客户端 | 真实 Harness 重叠配额 E2E 和供应商长时压测仍是独立发布门禁 |
| 企业 MCP | 通过；none/API Key/OAuth、分页/资源、按需加载、撤销、Agent 隔离和恢复通过；本轮补齐 URL 与传输安全一致性 | 通过；协议、OAuth、资源和工具生命周期继续交给官方 SDK/client；服务端与端侧双重拒绝非 HTTP(S)、userinfo、fragment 及协议不一致配置 | 真实第三方 OAuth、动态注册、真实 PTC 解释器未覆盖；旧 rc.2 checkout 只保留历史证据 |
| 企业插件管理 | 通过；企业市场授权、精确版本、安装/更新/卸载状态、重启提示和官方 `pluginManager` 路径通过 | 通过；复用官方 plugin manager/inventory/profile，不维护第二套 CLI/pnpm 状态机，官方管理页只按产品策略关闭入口 | 真实私有 registry/Git 网络故障与 RC1 Desktop 原生安装/重启链路仍需单独验收 |

本表把“功能通过”限定在已执行的 Web、服务端和受控协议桩证据内；未验证项不会由旧版本源码 checkout 或 peer 可安装性推导为兼容。

## Release notes 对照

- MCP 升级到官方 SDK v2 的协议协商、工具分页和无工具服务器能力已被本地 `dsh-mcp-client`/SDK v2 路径覆盖；资源、模板和读取由官方 `dsh-mcp-resources` 路径覆盖。OwnDsh 不新增第二套协议实现。
- 插件管理页新增安装、配置、启停和运行时卸载，但 OwnDsh 已经通过官方 `pluginManager` API 做安装、更新、卸载，并继续关闭官方页面以保留企业市场授权边界；两者没有重复 UI 入口冲突。
- Profile 设置迁移到当前插件配置、声明字段支持实时更新。OwnDsh 已把 `baseUrl` 和 `mcp.desiredConnected` 声明为 `volatile`，RC1 只要求测试按 Schemastery 的实时配置包装对象读取，生产路径已经统一使用 `get()`。
- PTC 包名和服务名统一到 `ptc-runtime`，当前 bundle 已使用 RC1 的 `dsh-ptc-runtime` 与 `ptcRuntime`；没有旧名称兼容代码需要保留。
- 插件安装和启动增加 Harness 版本兼容检查。本轮 bundle peer/dev 依赖与锁文件统一到 `0.1.7-rc.1`，Web E2E 也显式断言目标 runtime 版本。
- 终端、Agent Team、浏览器后端、Session V4、Remote `readBytes` 等变化没有命中 OwnDsh 当前导入、slot、hook 或产品入口；本轮没有为未使用能力增加适配层。

## 必要改动

1. 所有官方 Harness 包升级到 `0.1.7-rc.1`，Cordis 升级到 `4.0.4`，Schemastery 升级到 `3.18.4`，并补齐 RC1 所需的 Cordis group/include/loader 依赖。
2. MCP `Client` 的 `clientInfo.version` 改为读取官方 `APP_IDENTITY.version`，不再硬编码 alpha 版本。
3. Bundle 测试读取 RC1 Schemastery `volatile` 默认值包装对象；Web E2E 更新 RC1 版本、双语按钮和已移除的 workspace 路径操作。
4. MCP 管理端在服务端拒绝非 HTTP(S)、userinfo、fragment 及 `allowInsecureTransport` 与 URL 协议不一致的配置；端侧 runtime 对同一 assignment 再校验并隔离非法服务。

## 未覆盖范围

本轮没有验证真实第三方 OAuth provider、真实 PTC 解释器、RC1 Desktop 原生外壳、真实插件安装源网络故障、Session V4 迁移、Remote 二进制传输或 Agent Team 业务闭环。它们不影响本次已覆盖的 OwnDsh Web/MCP 结论，若要发布对应能力仍需单独验收。
