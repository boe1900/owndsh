# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方自由安装与企业目录并存、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离；构建与类型检查先产出 contracts 依赖声明，支持全新 checkout；通过官方 dsh-client-store 补齐 ui-primitives 类型依赖，发行时使用 Harness 共享实例；semver 比较企业与本机版本，避免将回滚或构建元数据误报为更新。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 官方 slot 共享的状态控制器，串行处理 Server、账号、插件和 MCP 状态/授权动作并返回地址保存与手动刷新结果；服务/账号或连接边界变化时取消旧事实请求，防止迟到数据与错误跨会话回填；账号/MCP 授权查询有截止时间，成功后刷新连接事实，取消和账号切换停止旧查询。
src/account-view.tsx: OwnDsh 账号/插件/MCP tabs 与全局门禁；账号呈现只读地址/设备/版本和刷新/退出/卸载，插件 tab 注入企业市场，MCP 卡片呈现连接/工具/凭据动作及服务器/工具 exposure 覆写，通过官方 ConfigForm 写入并显示有效档；Server 仅在门禁编辑，复用官方 close、键盘导航和窄屏布局。
src/mcp-exposure-settings.tsx: MCP exposure 配置子模块；订阅官方 ConfigForm 快照，解码服务器/工具覆写并提供四档曝光选择与工具简介展开控件；不处理连接、授权或工具执行。
src/confirm-action.tsx: 复用 Harness 共享 Modal/Button 的页面确认，封闭焦点并隔离外层 Escape，只有明确确认才调用业务动作，供账号与卸载入口共用。
src/plugin-market.module.css: 复用官方 tokens 的企业市场两行列表，搜索/刷新同排，分类/版本标签贴在标题后，滚动交给宿主设置页。
src/assets.d.ts: 声明官方 ui-primitives 类型入口的 KaTeX CSS 副作用导入，保持依赖严格类型检查，不打入运行包。
src/css-modules.d.ts: 声明本地 CSS Modules 与 CSS 副作用导入类型，供官方风格样式进入严格类型检查。
src/client.tsx: Client 组合根，只注册 OwnDsh settings.section 与访问门禁 shell.overlay，共享脱敏 store，并向设置注入官方 pluginManager Remote 与 configForms；复用账号事件与连接恢复通知，不接管官方插件页。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/企业插件目录/MCP DTO 与显式刷新解码，承载 OAuth/API Key 本地动作、严格 OAuth flow 进度与连接意愿/名称简介目录/发现数量/有效呈现事实；企业插件只投影包名、精确版本、安装 spec 和展示元数据，拒绝 Token、正文和本地安装事实。
src/plugin-market.tsx: OwnDsh 设置插件 tab 的企业目录，激活 tab 时刷新，切换时保留筛选与操作状态；两行列表展示版本/分类标签，搜索与刷新同排，安装/更新/卸载经 ConfirmAction 确认后委托官方 pluginManager。
tests/account-store.spec.ts: MCP 授权成功/失败/取消/截止时间及账号切换迟到隔离； 手动刷新进度/失败/重试、保存成败与动作串行、退出错误后的本地状态收敛、服务/账号切换的迟到数据与错误隔离，以及有界登录查询和 Session 零请求测试。
tests/account-view.spec.ts: 锁定门禁放行、Server 编辑状态白名单、MCP exposure 覆写解码和企业目录 semver 安装/更新判定。
tests/client.spec.ts: OwnDsh settings/shell.overlay 的注册身份、共享 store 与官方 pluginManager 注入测试，确保不替换官方插件页面。
tests/local-api.spec.ts: Server/账号/卸载/企业插件目录/MCP 工具简介白名单/计数一致/呈现与发现/Session DTO、固定路径、OAuth flow 绑定、脱敏投影、显式刷新与秘密字段拒绝测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
