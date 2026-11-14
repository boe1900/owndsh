<!--
[INPUT]: rc.3 官方会话导出与团队服务、Console 构建适配、Host carrier 及隔离浏览器实际结果。
[OUTPUT]: 记录两项远程会话操作的根因、当前契约、验证范围和发布依赖。
[POS]: 远程工作区的专项验收，补充 dsh-compatibility.md，不替代生产发布或双机验收。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 远程会话复制与团队开关验收

2026-11-14 的源码修复针对 Harness `0.2.2-rc.3`。当前 npm `owndsh-plugin@0.1.0-beta.21`、桌面预置插件和 NAS 部署尚未包含这次修改。

## 两项故障与修复

官方 `SessionMarkdownCopyController` 默认调用全局 `fetch`。在 Console 远程页，请求落到 Console 的 SPA，200 HTML 被当作 Markdown 复制。即使请求进入加密 link，旧 Host 也未开放原生 Markdown 路由。

构建期只给该控制器注入现有 `__DSH_TRANSPORT__.fetch`，保留官方同步启动的 deferred clipboard、HTTP fallback、取消、重复点击合并和 toast。成功响应必须是 `text/markdown`；错误 MIME 交由原生 `preparationFailed` 提示，不写入剪贴板。全局 `fetch` 和 ZIP 下载逻辑不变。

原始官方客户端 SHA-256 为 `90b490779c382d93b085ec7633963afbd3665dd9836b007860fd5d726940234c`。源码变化或构造接缝不唯一时构建失败。本次生成的独立和聚合资源共两份，均已注入。

团队开关调用 rc.3 新增的 `agentTeams/setEnabled`，旧 Host 白名单缺失。Host 现已精确准入该方法，状态仍由原生根会话 `team/mode` 事件和 `agentTeam` 投影持有。子会话限制、flush 与停用确认沿用原生实现。

## Host 权限契约

| 请求 | 当前边界 |
|---|---|
| `/api/session.markdown` | 仅 GET/HEAD、无 body、唯一 `sessionId`；拒绝空白、控制字符、超过 1024 字符及额外或重复 query。 |
| `agentTeams/setEnabled` | 仅既有 POST unary 路径。原生 RPC Host 校验 JSON envelope 和 URL method 绑定，业务参数与根会话检查由官方服务负责。 |
| 会话读取 | 沿用现有 Session 查询的 owner 权限；不以当前工作区列表排除历史和子会话。 |
| 凭据与跳转 | 原生 owner Cookie 只在 Host 内存，响应过滤凭据；Markdown 不跟随重定向。 |
| 其它 API | ZIP、settings、未知团队端点仍被拒绝。 |

## 验证结果

浏览器使用隔离的官方 rc.3 CLI Host、这次构建的完整原生 UI、生产 `native-transport` 与 `openDshCarrier`。本机 HTTP/WS 测试桥替代登录和加密连接建立，未注册企业设备、未使用真实账号，也未占用日常远控连接。模型为本机协议 fixture，不调用外部模型。

| 检查 | 结果 |
|---|---|
| 原始模块点击复制 | 复现系统剪贴板写入 `<!doctype html>…`，原生仍提示复制成功。 |
| 修复后点击复制 | 系统剪贴板与远端原生 `text/markdown; charset=utf-8` 响应逐字一致，保留中文、Markdown 和代码块。 |
| 非安全 HTTP | 通过局域网 IP 打开，`isSecureContext=false`，`navigator.clipboard` 和 `ClipboardItem` 均不存在；官方备用复制成功，系统剪贴板内容仍完全一致。 |
| 团队开启 | 实际点击开关，Host 收到 `POST /api/agentTeams/setEnabled`；刷新页面后仍为开启。 |
| 团队关闭 | 原生确认停用完成后刷新，开关仍为关闭。 |
| 错误响应 | 官方控制器回归验证 HTML/JSON 200 和远端拒绝均提示准备失败，且不调用本机 fetch。 |
| 权限与装配 | 独立审查通过，网络边界测试覆盖 GET/HEAD、404、非法 method/query/body、Cookie 隔离及 settings 拒绝。 |

Console 使用满足 engines 的 Node `24.21.0` 完成生产构建、类型检查及全量 23 文件、160 项测试。Host carrier、network、native carrier、secure link 四文件共 23 项通过，插件类型检查和构建通过，构建后的 bundle 另有 9 项通过。浏览器复现与回归脚本、7 项断言结果保存在本地 `.tmp/remote-session-actions-20261114/`，不随产品发布。

本轮浏览器验证不覆盖 NAS、企业登录、Noise/lease/Relay、真实多智能体模型任务和桌面安装包。现有加密链路另由 `remote-secure-link.spec.ts` 回归覆盖，不能把测试桥当作生产双机证据。

## 发布依赖

Console 的固定资源和远端 Host 插件必须同时更新，随后重载 Host 并重新建立远程连接。只刷新旧页面、只部署 Java Server，或只更新 Console，都不能完整修复这两项功能。当前源码未发布，不覆盖现有 `beta.21` 的版本事实。
