<!--
[INPUT]: NAS 运行容器制品校验、Mac 浏览器与 NAS Host 实测、Mac 原生及远程 Office 验收、表格只读与 Edge HTML 原生隔离交互验收、真实 Atria-Dawn 工具调用及双机标识服务。
[OUTPUT]: 本轮部署与业务验收事实、右栏能力矩阵、localhost 来源结论和未关闭问题。
[POS]: Console 原生远程工作区的跨物理机验收记录，补充本机真实模型报告，不扩大 Remote 协议或产品范围。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# NAS 管控台部署、跨机业务与右栏验收

日期为 2026-11-12。目标是验证部署在 NAS 的 OwnDsh 管控台和服务端能否操作真实设备，并确定右栏可交付的能力。源码保持未提交、未 push。

部署已完成，Mac 浏览器经 NAS 服务端操作 NAS、Mac 两个 Host 的文件和终端已实测，NAS Host 还完成真实模型与逐格式预览。验收期间 NAS DSH 容器被 OOM 杀死，恢复容器后继续测试。内存增长来源和更早的终端断链原因尚未确定，本报告不作全部稳定结论。

## 1. 部署事实

入口为 `http://home-nas:18080/`。本轮仅替换 Server、Console 应用镜像。

| 项目 | 实际结果 |
| --- | --- |
| Server 镜像 | `owndsh-server:console-preview-20261112-155655` |
| Console 镜像 | `owndsh-console:console-preview-20261112-155655` |
| Server JAR | 运行容器与本机制品 SHA256 一致，值为 `889ea63ac4fc2be46208520f79cb2b46072906443184e6f16fa311dd087d192d` |
| 静态资源 | 运行 Console 容器内全部 262 个文件逐文件哈希一致 |
| 数据库 | 部署前后 58 条 Flyway 记录及 checksum 相同，最新版本 57，无新迁移 |
| PostgreSQL、Redis、DSH | 容器 ID 未改变，原持久数据保留 |
| coturn | 未更新 |
| 部署时健康 | Server、Console 均 healthy |
| 备份 | Compose、环境、容器身份与可读取目录的数据库 dump 已保存 |
| 回退 | 原应用镜像保留，新增 Compose 覆盖文件独立存在 |

NAS 部署目录为 `/vol1/1000/docker/stacks/owndsh`。备份位于 `releases/console-preview-20261112-155655/backup`，包含秘密，不进入公共证据文件。应用使用原五个 Compose 文件，再追加 `compose.codex-console-preview.yml`。

部署时健康不等于业务始终可用。第 5 节记录 NAS 可达性异常、DSH 容器 OOM 和恢复证据。

## 2. 拓扑和已完成业务

浏览器运行于 Mac。NAS 同时运行 Java 协调与 Relay、Console 静态资源和独立 Linux DSH Host。远程业务经过 Noise 加密 carrier，Java 不执行文件或会话业务。`18121` 是 NAS 原生 DSH 的 SSH 回环管理入口，仅用于对照，不是管控台远程业务通道。

| 业务 | 结果及证据边界 |
| --- | --- |
| 员工正常浏览器登录 | 通过。使用授权验证码，登录后进入用户中心，仅显示本人 Mac、NAS 设备，没有管理菜单 |
| Mac 插件访问 NAS | 通过。打开 NAS 历史和待审批会话，在远程页批准一次只读机器标识命令 |
| 管控台独占提示 | 通过。显示设备被另一页面占用，提供接管操作 |
| 取消接管 | 通过。取消前后 link 均为 `rln_W510TMGQD5E6DX9DY02QYXGX1G`，原连接保留 |
| 管控台接管插件连接 | 通过。确认后新页连接 NAS，旧插件页停在断线遮罩，没有自动抢回 |
| 真实模型和工具 | 后续 3 轮、14 步完成。实际使用 write、read、edit、bash，生成文件和运行服务，不以模型自述作为落盘证据 |
| 会话历史恢复 | 通过。接管、显式重连后恢复同一会话，文件预览 tabs 保留，没有观察到自动重放操作 |
| 终端粘贴执行 | 通过。两条断言验证 NAS 服务 marker 和 Linux 平台，终端输出及 SSH 独立读取均证实证明文件在 NAS |
| 逐字符长输入 | 未关闭问题。输入过程中出现一次断链，命令未执行。正常粘贴后成功，尚不能认定具体失败原因 |
| NAS 管控台连接 Mac Host | 恢复后通过。远程终端返回 `darwin`、Mac 主机名和隔离工作区。创建 `console-mac-proof-7319.txt`，文件树及文本预览显示相同内容，本机文件读取独立核对成功 |
| Mac 主动断开、显式重连与关页释放 | 通过。主动断开后 link 为 null；重连产生新 link，文件 tabs 恢复；关闭该标签后服务端 link 再次为 null |
| NAS 运行中主动断开 | 终端路径通过。命令先输出 `RUNNING_7319`，断开期间完成延迟写入。重连后显示 `DONE_7319`，证明文件只包含一行 `RUN_ONCE_7319`。该命令含文件已存在就报错的保护，因此只证明副作用发生一次，不单独证明命令未被重放，也不代替模型运行中断线测试 |
| 模型命令审批拒绝 | 通过。先保留沙箱不可用失败，再让模型申请本次沙箱外执行。在原生审批界面点击拒绝，工具返回明确拒绝错误，SSH 核验 `approval-denied-7319.txt` 不存在；模型停止，没有换工具执行 |
| 最终 link 释放 | 通过。`2026-11-12T09:16:27.541Z` 读取两台设备均在线，两个 linkId 都为 null |

真实模型使用独立授权的 `Atria-Dawn · NAS双机验收`，没有更改企业默认模型。首个长任务收到 `ENT_UPSTREAM_INVALID_RESPONSE`，服务端记录 `UPSTREAM_ERROR_EVENT`。直接供应商最小探测成功，后续任务也成功；未证明错误由 token 上限引起，没有增加供应商专用重试或修改协议适配器。

NAS 容器缺少可用的 workspace-write 命令沙箱。模型命令先停在原生审批，再通过一次性授权执行指定测试命令。没有修改全局权限模式。该环境不能据此宣称默认受限 shell 已可用。

## 3. 右栏能力矩阵

以下矩阵保留初次 NAS Host 验收结果，HTML 当前变更见本节末尾的隔离交互补充。初次目标仅为 NAS Host。文件均位于 `/data/workspace/nas-preview-20261112`，没有访问个人业务文件。Mac Host 的 Office 补充验收见本节后文，两台 Host 的转换服务状态分别记录。

| 能力 | 当前状态 | 实测事实与限制 |
| --- | --- | --- |
| 工作区文件树 | 可用 | 读取 NAS 目录与测试文件，路径显示为 NAS 工作区 |
| 文本、JSON | 可用 | 显示 `NAS_TEXT_7319` 和 JSON 的 NAS、7319 内容，保留代码显示 |
| Markdown | 可用 | 标题 `NAS_MARKDOWN_7319`、表格和相对图片成功渲染 |
| PNG、SVG | 可用 | NAS PNG 独立预览成功，Markdown 相对 PNG、SVG 均加载为 Blob 图片，尺寸与源文件一致 |
| PDF | 可用 | 实际显示第一页、`NAS_PDF_7319` 和缩放控件 |
| Excel、CSV | 只读查看可用 | 工作表和单元格内容可见。后续 NAS 管控台→Mac 实测及原生 rc.5 源码确认仅支持查看、选择和复制，不支持编辑保存；两台 Host 使用同一只读 renderer |
| 自包含 HTML | 静态预览可用 | `NAS_STATIC_7319` 和内联样式可见，仍显示 `SCRIPT_NOT_RUN`，脚本被移除 |
| HTML 外部资源和内嵌网站 | 当前受限 | iframe 被移除，链接 href 被移除，普通网络图片被静态 CSP 阻止，不提供完整网页运行环境 |
| Word、PowerPoint | 当前不可用 | DOCX、PPTX 均显示 Office 预览不可用。NAS 原生 owner 页打开相同 DOCX 也报同样错误 |
| 交互终端 | 基础路径可用，稳定性待查 | 正常粘贴命令在 NAS 执行成功。保留逐字符长输入断链记录，不作为稳定性验收通过 |
| `localhost:5173` 网站、Vite、React dev server | 未提供 | Console 未装配 `ui-sidebar-browser`，当前 carrier 没有任意 HTTP 端口或 WebSocket 网站隧道 |
| 浏览器可达的外部网站 | 不作为右栏能力提供 | 普通 Markdown 链接可以打开浏览器标签，不等于已提供网站面板。未验收任意站点嵌入 |
| 第三方插件的专用预览、Desktop 专属能力 | 未验收 | 远端安装插件不代表 Console 获得其 Client renderer 或系统能力 |

静态 HTML 的 iframe 使用空 sandbox，CSP 包含 `script-src 'none'`、`connect-src 'none'`、`frame-src 'none'` 和 `img-src data:`。这解释了单文件样式可见、脚本不运行及网络图片被阻止的实际行为。

补充表格编辑核验：复制既有夹具为 Mac 隔离工作区的 `preview-edit-check.xlsx` 和 `preview-edit-check.csv`，记录源文件哈希。通过 NAS 管控台尝试公式栏输入，Excel 另尝试双击单元格输入并确认，显示值仍为 `NAS_XLSX_7319` 和 `machine`。点击“重新读取文件”后仍为原值，Mac 独立读取确认两个文件字节及 SHA256 均未改变。控件可能接收临时输入，不代表单元格已修改或文件已保存。页面没有保存操作，不能将此次核验记为保存成功。

官方 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview@0.2.1-rc.5` 的 `README.zh.md` 明确列出只读公式栏，并说明不支持编辑、重算和导出；`ExcelBody` 固定 `allowEdit: false`，隐藏工具栏，仅保留复制菜单，也没有文件写回回调。原生本地使用同一组件。因此 Excel、CSV 的产品边界由“未验证编辑保存”改为“原生只读，不支持编辑保存”，按用户决定不新增上游不支持的能力。这不影响 Agent 或终端依照原生权限修改工作区文件。

此前 HTML 补充核验：同一 Mac 工作区的 `preview-script-check.html` 源文件包含将 `SCRIPT_NOT_RUN` 改为 `SCRIPT_EXECUTED` 的脚本，远程页仍显示前者。实际 iframe 的 srcdoc 已移除该脚本，sandbox 为空，CSP 明确禁止脚本。原因是 `console/scripts/build-native-workspace.mjs` 将官方 `interactivePreview` 固定为 false。原生 DSH 则跟随 `developerTools.enabled`，支持在 `sandbox="allow-scripts"` 的隔离 frame 内运行脚本；当时 Console 没有开放此模式，不能将其归类为原生不支持。该次核验没有修改预览设置或产品代码；后续恢复及 Edge 验收见下文。

以上补充的 DOM、截图、iframe 属性及前后文件哈希位于 `.tmp/remote-office/`，对应无密清单的 `spreadsheetAndHtmlFollowup`。HTML 静态预览与远端网站代理仍是不同能力，开启原生交互预览也不会自动提供远端 dev server 访问。

初次验收时，NAS 原生页的转换服务不可用，具体配置原因未核实，Host carrier 也尚未准入官方 renderer 调用的 `officeToPdf/generation` 和 `render`。后续补齐了这两个方法的准入与文件授权，并在 Mac Host 完成真实远程验收。NAS Host 没有在此次补充验收中更新，也没有安装转换引擎，其原生转换失败仍未关闭。

补充 Mac 本机对照：`http://127.0.0.1:63256/` 是运行于 Mac 的原生 DSH，与上述转发到 NAS 的 `18121` 不同。将同一份 `sample.docx`、`sample.pptx` 夹具复制到该 Host 的隔离工作区后，原生 `officeToPdf/render` 均返回成功，分别产生 24910、48720 字节的完整 PDF，`missingFonts` 均为空；浏览器右栏分别显示文档正文和幻灯片。证据为 `.tmp/nas-console-preview/mac-office-sample.docx.json`、`mac-office-sample.pptx.json` 和 `screenshots/mac-native-docx-available.png`、`mac-native-pptx-available.png`。这些字节数来自本机对照，不是远程 PDF 字节采集。

补充 NAS 管控台到 Mac 的远程验收：隔离 Mac Host `http://127.0.0.1:49759/` 已替换 Host bundle 并重启，未替换其 Client bundle；NAS Server、Console 和 NAS Host 均未因此更新。在 `http://home-nas:18080/workspace.html?deviceId=2120400737015017474`，设备条显示 `coladeMac-mini` 已连接，右栏分别显示 DOCX 正文、PPTX 幻灯片和 PDF 第 1 页。路径属于 Mac 的 `.tmp/remote-workspace-nas/run-1794377836171/controller/workspace`，同目录 `plain.txt` 显示 `MAC_OFFICE_REGRESSION_7319`。Office/PDF 夹具从 NAS 复制，正文仍含 `NAS_DOCX_7319`、`NAS_PPTX_7319` 和 `NAS_PDF_7319`，该文字是夹具标识，不代表实际转换发生在 NAS。转换由被控 Mac 的原生服务完成，结果通过既有加密 carrier 返回，NAS 不需要转换引擎。

Host 对 Office RPC 使用原生 envelope 校验、URL 与方法绑定及 64 KiB 请求上限。`render` 只用 `workspaceFileScopeId` 与 `path` 授权，并复用工作区 realpath 范围约束；原生 Office 不读取普通文件接口的 `options.baseFile`，因此不允许该字段改变授权所检查的源路径。回归覆盖未知会话、相对及绝对越界、相似目录前缀、外部 symlink、`baseFile` 伪装、方法错配、缺失 envelope、未开放方法和超限请求，拒绝请求不会进入上游。3 个聚焦测试文件共 15 项通过，typecheck、build 和独立 correctness/security 审阅通过。

远程 UI 证据为 `.tmp/remote-office/console-mac-{docx,pptx,pdf,text}.dom.txt` 及 `screenshots/console-mac-{docx,pptx,pdf,text}.png`。运行 Host SHA256 为 `9a0dcaf88e093fc81faf2b8704a2a450344967e44624e858e05aa2a938ce975d`，与本次构建一致。更新前后及最终连接状态分别保存在 `runtime-update.json` 和 `final-state.json`，无密清单的 `officePreviewFollowup` 保存制品与页面证据哈希。

### HTML 原生隔离交互补充

本轮只删除 Console 构建脚本中的强制静态覆盖，并发布 `owndsh-console:html-interactive-20261112-181336`。Server、Host、数据库和 Nginx 配置均未因此更新。NAS 运行容器全部 262 个文件与本机制品哈希一致，148 个官方资源均通过 assembly 哈希校验，单包和合并包保留原生 `interactivePreview` hook。旧镜像和本次发布目录内的 Compose 备份可供回退。

当前预览开关由冻结的 `ui-settings.enabled=true` 提供，不实时读取目标 Mac 偏好。原生 iframe 的实际属性为 `sandbox="allow-scripts"` 和 Blob URL，没有 `allow-same-origin`、Host 回调或加密连接对象。交互分支没有静态模式的禁网 CSP，外部 URL 使用访问者浏览器网络，不能宣称为网络隔离。

最终结论：原生隔离交互 HTML 预览在 Microsoft Edge 的 NAS→Mac 链路可用。用户授权后完成以下真实页面验收。

| 用例 | Edge 验收结果 |
| --- | --- |
| NAS→Mac 内联脚本及相对 JS/CSS | `INLINE_SCRIPT_PASS`、`MAC_RELATIVE_JS_PASS_8427` 和 `MAC_RELATIVE_CSS_PASS_8427` 均可见，CSS 由脚本读取 computed style 校验 |
| 按钮交互 | 计数连续从 0 增加到 1、2 |
| 父页面 DOM 与 Storage | `PARENT_DOM_BLOCKED_PASS`、`PARENT_STORAGE_BLOCKED_PASS` 可见 |
| opaque iframe 自身 Storage | `OPAQUE_ORIGIN_STORAGE_BLOCKED_PASS` 可见 |
| 重新读取文件 | 计数重置，脚本和资源重新运行，按钮再次可用 |
| 整页刷新 | 新 link 建立后恢复同一 HTML，脚本、资源、隔离标记和按钮均正常 |
| 主动断开与显式重连 | 新 link 建立后恢复同一 HTML，脚本、资源、隔离标记和按钮均正常 |
| 同一文件在 Mac 原生 DSH | Edge 打开 `http://127.0.0.1:49759/`，全部脚本、资源、隔离标记及按钮对照通过 |
| 工作区外相对 `.js` | 显示“无法预览这份 HTML 文档”，连接保持正常 |
| 指向工作区外的 symlink `.js` | 显示相同失败提示，连接保持正常 |
| 不存在的相对 `.js` | 显示相同失败提示，不静默当作成功，连接保持正常 |
| 普通文本回归 | 同一 Mac 工作区 `plain.txt` 仍显示 `MAC_OFFICE_REGRESSION_7319` |
| 夹具源文件 | 7 个文件哈希均未改变 |

此前 Codex IAB 中，NAS→Mac 与同文件 Mac 原生 DSH 的 Blob iframe 均空白。最小对照中的简单 Blob 和原生 document.write Blob 也空白，srcdoc 控制组则执行 `SRCDOC_SCRIPT_PASS`。Edge 对照已通过，该差异不再阻断本项验收；IAB 内部原因仍未确定，未修改原生 renderer 或 sandbox 绕过。

Console 完整构建、2 文件 5 项 transport/image 回归和 2 文件 10 项 carrier/network 边界回归通过。独立只读审阅未发现本次局部改动的 correctness/security 阻断项。

只保留原生直接 classic JS/CSS 打包和 64 资源、单资源 4 MiB、总量 32 MiB 上限，不新增 module、CSS import、动态资源或远端网站代理。代码、文档与验收制品均未提交、未 push。历史静态验收未删除，本轮证据独立记入 `htmlInteractiveFollowup`，临时文件位于 `.tmp/html-interactive/`。

Edge 结果为 `edge-results.json`，页面证据为 `edge-*.ax.txt` 和对应截图，原生对照为 `edge-native-dsh-pass.*`。验收结束主动断开测试连接，保留 NAS 服务与用户体验页。`edge-final-state.json` 在 `2026-11-12T11:55:52.273Z` 记录 Mac、NAS 两设备均为 `linkId=null`。

## 4. localhost 来源对照

两台机器同时监听各自回环的 `5173`，使用不同机器标识。

| 发起请求的位置 | 实际响应 |
| --- | --- |
| NAS 上模型启动服务后的 shell 请求 | `NAS_SERVER_7319`、`home-nas-dsh`、`linux` |
| NAS 远程工作区右栏终端请求 | 同上，两条断言通过 |
| Mac 浏览器点击远端 Markdown 中的网站链接 | `MAC_CONTROL_8426`、`coladeMac-mini`、`darwin` |

浏览器对照地址为 `http://localhost:5173/identity?probe=markdown7319`。Mac 请求日志记录该 query，浏览器可见页面返回 Mac 标识。NAS shell 使用回环地址则返回 NAS 标识。因此，文件存放和命令执行在远端，不会改变浏览器 URL 中 localhost 的含义。

当前 Console 打开 `network-preview.html` 的行为需要单独区分。嵌套 iframe 被移除，网络图片被 CSP 阻止，页面链接失去 href。Mac 日志没有该文件的 `iframe-probe-7319`、`pixel.svg?probe=7319` 或 `link-probe-7319` 请求。NAS 恢复后取回持久化请求日志，同样没有这三个 probe。两端日志只覆盖本轮具名测试请求，不代表验证了任意外部资源。

文件预览能力已经接通。运行中的远端网站仍需独立的 HTTP、WebSocket 端口转发与隔离设计，当前没有实现。

## 5. 未关闭问题

| 编号 | 现象 | 已证实与尚未证实 |
| --- | --- | --- |
| NAS-01 | NAS 可达性异常，DSH 容器 OOM | 首先出现 SSH、Tailscale ping 和 Java API 超时，LAN ping 和 Nginx 静态页仍可达。恢复后 Docker 记录 DSH `OOMKilled=true`、退出码 137，结束于 `2026-11-12T08:58:24.225464601Z`。保存的恢复阶段快照中，NAS 内存 3901MiB，swap 已用 1528MiB，load average 为 5.28、78.81、92.01。已确认 OOM 导致 Host 退出，尚未确定内存增长来源及其与早期断链的关系 |
| TERM-01 | 长命令逐字符自动输入期间断链 | 第一次连接丢失记录为 `2026-11-12T08:38:11.076Z`。正常粘贴后命令成功。后续另有 NAS-01，不能据此认定第一次与后续异常同源，也不能认定一定是帧队列上限 |
| OFFICE-01 | NAS Host 原生 Office 转换不可用 | Mac Host 的远程准入与文件授权已补齐，NAS 管控台到 Mac 的 DOCX/PPTX 预览实测通过。NAS 原生 owner 页此前也报不可用，具体配置原因仍未核实，不能据 Mac 结果宣称 NAS Host 已支持 |
| MODEL-01 | 首个真实模型长任务失败 | 服务端收到上游错误事件，后续同模型成功。供应商内部原因未知 |

NAS-01 恢复后完成 Mac Host 文件和终端、主动断开、重连与关页释放、原生审批拒绝，并验证 NAS 延迟终端任务跨断线完成，未观察到重复写入。命令重放、模型生成中断线、Mac Host 的真实模型调用和长期稳定性仍未验收。DSH 重启属于环境恢复，不作为 OOM 问题已修复的证据。内核日志读取没有权限，因此尚无内核 OOM 明细或故障时进程内存快照。

## 6. 证据与保留状态

无密结果位于 [跨机验收清单](../.audit/console-nas-cross-machine-evidence.json)。临时证据位于 `.tmp/nas-console-preview/`，包含部署制品校验、逐格式 DOM、截图、模型最小探测及 Mac 请求日志。私有 Cookie、账号、密钥和备份不进入无密清单。

模型创建的 NAS `server.mjs` 和测试文件保留。OOM 结束了原 PID 119，恢复容器后使用同一源文件重新启动服务并更新 `service.pid`，接口再次返回 `NAS_SERVER_7319`。Mac 对照服务和既有体验环境保留。

最终快照时间为 `2026-11-12T09:16:06.426825Z`。Server、Console、PostgreSQL、Redis 均 healthy，DSH、coturn 运行中。Server、Console 镜像与本轮制品一致，DSH 容器身份未变，只有启动时间改变。DSH 内存快照为 308.3MiB，Java 为 564.5MiB，该快照不能证明长期无内存增长。两台测试网页服务返回各自的机器标识。

两台设备控制 link 已释放，NAS 体验标签和管控台保留。NAS 标签点击重新连接后恢复原会话和文件预览，避免占用用户后续连接。

Office 补充验收后，于 `2026-11-12T09:51:22.414Z` 再次核对两台设备在线且 linkId 均为 null。Mac 远程页已主动断开并保留，可点“重新连接”体验 Word/PPT。仅更新了隔离 Mac Host，源码仍未提交、未 push。

本报告只证明表中已实际完成的项目，不覆盖 ICE 直连、TURN、TLS、多节点或长期稳定性。既有本机报告见 [真实模型与连接控制验收](console-remote-real-model-verification.md)，产品契约见 [管控台工作区预研](console-workspace-product-research.md)。
