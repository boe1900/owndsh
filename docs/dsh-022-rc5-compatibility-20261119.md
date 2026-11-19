<!--
[INPUT]: 官方 rc.3/rc.5 精确源码、npm 依赖图、插件/Console 检查和隔离 Host、桌面发行制品的实际结果。
[OUTPUT]: 记录 rc.5 兼容判断、beta.22 适配、发布状态与验证边界。
[POS]: 本轮升级事实报告；当前依赖矩阵见 dsh-compatibility.md，历史 rc.3 事实不覆盖为新结果。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH rc.5 兼容性与发行验收

2026-11-19，本轮将插件和 Console 固定 assembly 从 `0.2.2-rc.3` 升级到 `0.2.2-rc.5`，插件版本 `0.1.0-beta.22`。桌面锁定官方 tag `dsh-v0.2.2-rc.5`、不可变 commit `9c2670d3bce5275e0d1610272958121af87787bb`，预置同一插件版本。

## 兼容判断

rc.3 至 rc.5 的 Host wire、API gateway、登录/设置/凭据、插件管理、MCP/工具执行、Client slot 和企业使用的 pi-ai 实现没有变化。相关 package manifests 除版本号外无变化。Desktop、desktop-host、侧栏品牌及账号菜单也只修改 package 版本。两项独立只读审阅与实际源码比较支持保留当前接缝，不新增业务适配层。

官方 rc.4 的拒答兼容修改在官方 DeepSeek Messages 翻译器，企业路径继续复用官方 pi-ai。rc.5 的搜索路由将 `deepseek-official`、`deepseek-account` 匹配到官方服务端搜索。OwnDsh 企业 provider 路由保持不变，因此仍选择独立 DeepSeek Search API，需要相应凭据；本轮没有把企业 bearer 转发给官方搜索，也不宣称企业模型享有免按次搜索。

## 本地适配

- DSH 开发依赖、peers、release-age 白名单、carrier 应用版本和原生 assembly 版本同时精确锁定 rc.5。
- Cordis group 从 `1.0.5` 对齐官方 `1.1.0`，消除其与 Cordis 4.1、loader 1.1 和 app-boot 的 peer 冲突。其他非 DSH 包的锁定版本不变。
- Console 继续固定 Ego `0.9.14`，保留 shell、conversation、preview 和 Markdown 严格 hash 门禁。
- Remote wire/hash 和 Java 协议不变。Console 与远端 Host 必须配对升级，旧 Host 会以 `ENT_REMOTE_DSH_VERSION` 拒绝工作区连接，禁止关闭版本检查来混用。
- 包含此前已提交的远程 Markdown 复制、团队开关、原生插件/任务/More/预设入口，以及远程弹窗宽度和原生 Switch 改进。

## 验证

| 验证对象 | 结果及证据 |
|---|---|
| 升级前基线 | 原 rc.3 依赖下 `pnpm --dir plugin check` 通过。 |
| rc.5 插件 | 类型、构建、35 文件/239 项模块测试和 5 项 workspace 测试通过；frozen install 和 supply-chain 检查通过；开发图无 peer 冲突。 |
| rc.5 Console | Node 24.15 下生产构建、TypeScript、24 文件/169 项测试通过；61 Client 模块、166 固定资源。 |
| rc.5 真实 Host MCP | Edge native/PTC 各 9 项业务通过，包括登录、none/API-key/OAuth、分页、资源、搜索累加/释放/隔离、401 刷新、invalid_grant 恢复和 Host 重启。两模式 structured 各 3 项通过，覆盖 outputSchema、structuredContent、跨工具值传递和 isError。 |
| 桌面接缝 | 使用 rc.5 官方源码与 beta.22 锁运行 `npm test`，18 通过、0 失败，2 个 Windows 解释器检查在 macOS 跳过，留给 Windows CI。 |
| 双 Host 与真实模型 | 两个隔离 rc.5 Host 的登录、远控开关、会话/文件/终端、刷新重连、断线阻断、166 资源 GET/hash、Ego 导航/画面/点击通过。Atria-Dawn 真实工具写文件与 shell 读取、Mac 执行位置隔离、多轮上下文通过；经过真实部分输出后中断、后续恢复和 Host 静默恢复登录补验通过。验收脚本显式点击 composer 释放 Ego 键盘接管，并按渲染后的空白分隔识别部分输出，未修改产品逻辑。 |
| npm 发布 | [beta.22](https://www.npmjs.com/package/owndsh-plugin/v/0.1.0-beta.22) 已发布到 `next`；[发行流水线](https://github.com/boe1900/owndsh/actions/runs/44452148832) 全部成功。registry SHA-512 校验通过，GitHub CI 上传包与 npm 包逐字节一致；对照本地验收包，52 个文件逐字节相同，package.json 仅由 npm 排序键、JSON 语义相同。 |
| 桌面发行 | `7814fef` 与 `v0.2.2-rc.5` 的 [Windows x64、macOS ARM64/x64 构建](https://github.com/boe1900/owndsh-desktop/actions/runs/44453742535) 全部成功；[正式 Release](https://github.com/boe1900/owndsh-desktop/releases/tag/v0.2.2-rc.5) 为公开 latest，非 Draft、非 prerelease，10 个资产齐全。Windows CI 完成 macOS 本机跳过的解释器检查。 |
| 正式 Mac 包 | 从 Release ARM64 ZIP 解包，实际大小和 GitHub SHA-256 一致；DSH、desktop-host、web-frontend 均为 rc.5，预置插件 beta.22。随包 5 个插件文件与 npm 内容匹配，package.json 按官方 builder 清理规则比对。App deep/strict 签名与稳定 `com.owndsh.desktop` requirement 通过。隔离启动、企业 PKCE 登录、真实 Atria-Dawn 对话及同 profile 重启后的凭据和历史恢复通过，零页面异常。 |
| 更新 feed | Windows EXE 与双架构 macOS ZIP 的实际大小、SHA-512 和 GitHub SHA-256 一致；macOS feed 同时包含 ARM64/x64。两个 `latest/download` URL 返回已核验的 feed。本轮未执行旧版日常 App 原地更新。 |

运行证据保留了验收脚本失败和补验过程。双 Host 首轮已通过核心业务、工具和多轮对话，部分输出检查因 Markdown 将数字换行渲染为空白而误判；同 Host 补验通过实际中断和继续。正式 Mac 包前三项启动、登录和模型验收通过后，重启脚本在 Host 就绪前解析响应失败；同 profile 的独立补验通过重启恢复。最终结论合并两次记录，不把早期失败改写为通过。对应证据分别为 `e2e/run-1795058011799/result.json`、`e2e/run-1795058635946/result.json`、`desktop/smoke-third-attempt.json` 与 `desktop/restart-result.json`。

临时无密证据位于 `.tmp/dsh-022-rc5/`；决策记录位于 `.audit/rc5-upgrade.tsv`。隔离 profile 和临时登录凭据不提交。

## 运行边界

本轮使用本机独立 Java/PostgreSQL/Redis、两个隔离 rc.5 Host 和独立 Edge，正式 Mac ARM64 包使用隔离 profile，不替换日常桌面安装。NAS 跨机、Windows/Intel 交互、Android、P2P/TURN、生产 TLS 和多节点不是本轮验收范围。三平台构建与更新 feed 校验不等于三个系统的交互验收，也不代表已在用户日常安装上执行原地更新。
