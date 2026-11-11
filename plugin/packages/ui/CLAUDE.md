# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方 Plugins → Discover、自定义索引、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离；构建与类型检查先产出 contracts 依赖声明，支持全新 checkout；通过官方 dsh-client-store 补齐 ui-primitives 类型依赖，发行时使用 Harness 共享实例。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 官方 slot 共享的状态控制器，串行处理 Server、账号和 MCP 状态/授权动作并返回地址保存与手动刷新结果；服务/账号或连接边界变化时以同一请求代次取消旧事实请求，防止迟到数据与错误跨会话回填；账号/MCP 授权查询有截止时间，成功后刷新连接事实，取消和账号切换停止旧查询。
src/account-launcher.tsx: 官方 settings.launcher 的企业账号快捷入口，使用共享 store、原生 Menu 和既有退出确认；登录后提供远程设备选择，身份变化关闭选择弹窗，设置导航交还宿主。
src/account-launcher.module.css: 账号快捷入口的展开/折叠尺寸与首字头像，复用原生侧栏几何和主题 tokens。
src/account-view.tsx: OwnDsh 账号/技能/MCP tabs 与全局门禁；账号呈现只读地址/设备/版本和刷新/退出/卸载，技能 tab 注入发现/已安装本地技能卡片，MCP 卡片呈现连接/工具/凭据动作及服务器/工具 exposure 覆写，通过官方 ConfigForm 写入并显示有效档；插件发现和安装归官方 Plugins → Discover，Server 仅在门禁编辑，复用官方 close、键盘导航和窄屏布局。
src/mcp-exposure-settings.tsx: MCP exposure 配置子模块；订阅官方 ConfigForm 快照，解码服务器/工具覆写并提供四档曝光选择与工具简介展开控件；不处理连接、授权或工具执行。
src/confirm-action.tsx: 复用 Harness 共享 Modal/Button 的页面确认，封闭焦点并隔离外层 Escape，只有明确确认才调用业务动作，供账号与卸载入口共用。
src/assets.d.ts: 声明官方 ui-primitives 类型入口的 KaTeX CSS 副作用导入，保持依赖严格类型检查，不打入运行包。
src/css-modules.d.ts: 声明本地 CSS Modules 与 CSS 副作用导入类型，供官方风格样式进入严格类型检查。
src/client.tsx: Client 组合根，本机注册 OwnDsh 设置/账号/门禁并共享脱敏 store；严格读取前置 view 元数据后，远端页仅注册 shell.bottom 目标条与 shell.overlay 阻断，不创建本机账号/技能或接入远端设置；无效远端引导拒绝降级成本机。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/可安装与已安装技能/MCP DTO 与显式刷新解码，承载 OAuth/API Key 本地动作、技能安装和严格 OAuth flow 进度与连接意愿/名称简介目录/发现数量/有效呈现事实；插件市场由 DSH 官方索引服务承载，本地 API 不投影插件目录。
src/remote-api.ts: 远控浏览器网络边界，复用 contracts 设备 schema 严格解析非秘密 view 与本机控制响应，只接受固定同源路径与 canonical view URL；严格匹配 ENT_REMOTE_BUSY/409 后提供占用提示，重连接受新的隔离 view，不持有票据或转发业务。
src/remote-store.ts: 独立设备选择与固定远端页控制器，按订阅生命周期取消请求；本机只显式刷新，远端 15 秒检查/可见性检查，断线继续保活但保持锁定直到用户重连并整页加载，返回本机不等待 close。
src/remote-workspace.tsx: 原生 Menu 入口的设备弹窗、确认本机入站开关、持续机器名和不可关闭断线卡片；仅呈现控制事实，远端业务仍由官方工作区/会话页面负责。
src/remote-workspace.module.css: 复用官方主题 tokens 的设备列表、shell.bottom 状态条与阻断卡片，在窄屏保留明确机器名和返回入口。
src/skill-market.tsx: OwnDsh 设置技能 tab 的发现状态、已安装条件筛选与分类筛选，展示 `_icon.png`、WorkBuddy 元数据、搜索、安装进度、启用开关、安装和编辑/打开文件夹/卸载菜单；发现状态合并目录与本地副本，所有动作经 EnterpriseSkillStore 委托本地 Host API。
src/skill-market-filters.ts: 技能市场的纯数据投影，合并目录与本地副本并生成分类筛选；不依赖 React 或 Host。
src/skill-market.module.css: 技能 tab 的分类筛选、已安装数量按钮、双列卡片、图标、搜索栏、标签和窄屏布局，复用宿主 tokens。
src/skill-store.ts: 本地可安装/已安装技能列表、串行安装/启用/卸载和 Host 文件动作的外部状态控制器；账号边界清空旧事实，刷新失败收敛 busy 状态；不解析正文或拼接本地路径。
tests/account-store.spec.ts: MCP 授权成功/失败/取消/截止时间及账号切换迟到隔离； 手动刷新进度/失败/重试、保存成败与动作串行、退出错误后的本地状态收敛、服务/账号切换的迟到数据与错误隔离，以及有界登录查询和 Session 零请求测试。
tests/account-view.spec.ts: 锁定门禁放行、Server 编辑状态白名单和 MCP exposure 覆写解码。
tests/client.spec.ts: 本机设置/账号/门禁的注册身份与共享 store，以及远端分支只注册目标条/阻断、无效 metadata 不降级成本机的回归。
tests/remote-api.spec.ts: 固定控制路径、同源凭据、strict 设备/metadata、秘密字段拒绝、安全 view URL、新 view 重连及占用/认证/未知错误的严格分类。
tests/remote-store.spec.ts: 设备选择不轮询/不自动连接、失败重试、卸载迟到隔离、远端断线锁定/显式重连、创建/重连占用提示，以及不等待 close 返回本机的行为回归。
tests/skill-store.spec.ts: 本地可安装/已安装技能清单刷新、安装后迁移、设备启用/卸载以及 Host 文件动作的最小状态回归。
tests/skill-market.spec.ts: 技能市场全部视图合并、本地副本覆盖和分类投影回归。
tests/local-api.spec.ts: Server/账号/卸载/技能/MCP 工具简介白名单/计数一致/呈现与发现/Session DTO、固定路径、OAuth flow 绑定、脱敏投影、显式刷新与秘密字段拒绝测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
