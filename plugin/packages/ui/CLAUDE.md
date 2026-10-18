# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方 Plugins → Discover、自定义索引、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离；构建与类型检查先产出 contracts 依赖声明，支持全新 checkout；通过官方 dsh-client-store 补齐 ui-primitives 类型依赖，发行时使用 Harness 共享实例。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 官方 slot 共享的状态控制器，串行处理 Server、账号和 MCP 状态/授权动作并返回地址保存与手动刷新结果；服务/账号或连接边界变化时取消旧事实请求，防止迟到数据与错误跨会话回填；账号/MCP 授权查询有截止时间，成功后刷新连接事实，取消和账号切换停止旧查询。
src/account-view.tsx: OwnDsh 账号/技能/MCP tabs 与全局门禁；账号呈现只读地址/设备/版本和刷新/退出/卸载，技能 tab 注入发现/已安装本地技能卡片，MCP 卡片呈现连接/工具/凭据动作及服务器/工具 exposure 覆写，通过官方 ConfigForm 写入并显示有效档；插件发现和安装归官方 Plugins → Discover，Server 仅在门禁编辑，复用官方 close、键盘导航和窄屏布局。
src/mcp-exposure-settings.tsx: MCP exposure 配置子模块；订阅官方 ConfigForm 快照，解码服务器/工具覆写并提供四档曝光选择与工具简介展开控件；不处理连接、授权或工具执行。
src/confirm-action.tsx: 复用 Harness 共享 Modal/Button 的页面确认，封闭焦点并隔离外层 Escape，只有明确确认才调用业务动作，供账号与卸载入口共用。
src/assets.d.ts: 声明官方 ui-primitives 类型入口的 KaTeX CSS 副作用导入，保持依赖严格类型检查，不打入运行包。
src/css-modules.d.ts: 声明本地 CSS Modules 与 CSS 副作用导入类型，供官方风格样式进入严格类型检查。
src/client.tsx: Client 组合根，只注册 OwnDsh settings.section 与访问门禁 shell.overlay，共享脱敏 store，并向设置注入 configForms；官方 plugin-market bundle 负责 Plugins → Discover，技能页不创建新会话，避免在未选定 DSH workspace 时产生歧义。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/可安装与已安装技能/MCP DTO 与显式刷新解码，承载 OAuth/API Key 本地动作、技能安装和严格 OAuth flow 进度与连接意愿/名称简介目录/发现数量/有效呈现事实；插件市场由 DSH 官方索引服务承载，本地 API 不投影插件目录。
src/skill-market.tsx: OwnDsh 设置技能 tab 的发现状态、已安装条件筛选与分类筛选，展示 `_icon.png`、WorkBuddy 元数据、搜索、安装进度、启用开关、安装和编辑/打开文件夹/卸载菜单；发现状态合并目录与本地副本，所有动作经 EnterpriseSkillStore 委托本地 Host API。
src/skill-market-filters.ts: 技能市场的纯数据投影，合并目录与本地副本并生成分类筛选；不依赖 React 或 Host。
src/skill-market.module.css: 技能 tab 的分类筛选、已安装数量按钮、双列卡片、图标、搜索栏、标签和窄屏布局，复用宿主 tokens。
src/skill-store.ts: 本地可安装/已安装技能列表、串行安装/启用/卸载和 Host 文件动作的外部状态控制器；不解析正文或拼接本地路径。
tests/account-store.spec.ts: MCP 授权成功/失败/取消/截止时间及账号切换迟到隔离； 手动刷新进度/失败/重试、保存成败与动作串行、退出错误后的本地状态收敛、服务/账号切换的迟到数据与错误隔离，以及有界登录查询和 Session 零请求测试。
tests/account-view.spec.ts: 锁定门禁放行、Server 编辑状态白名单和 MCP exposure 覆写解码。
tests/client.spec.ts: OwnDsh settings/shell.overlay 的注册身份与共享 store 测试，确保不替换官方插件页面。
tests/skill-store.spec.ts: 本地可安装/已安装技能清单刷新、安装后迁移、设备启用/卸载以及 Host 文件动作的最小状态回归。
tests/skill-market.spec.ts: 技能市场全部视图合并、本地副本覆盖和分类投影回归。
tests/local-api.spec.ts: Server/账号/卸载/技能/MCP 工具简介白名单/计数一致/呈现与发现/Session DTO、固定路径、OAuth flow 绑定、脱敏投影、显式刷新与秘密字段拒绝测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
