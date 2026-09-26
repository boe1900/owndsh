# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方插件管理页同步、受控企业目录、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离；构建与类型检查先产出 contracts 依赖声明，支持全新 checkout；通过官方 dsh-client-store 补齐 ui-primitives 类型依赖，发行时使用 Harness 共享实例；semver 比较企业与本机版本，避免将回滚或构建元数据误报为更新。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 官方 slot 共享的状态控制器，串行处理 Server、账号、插件和 MCP 状态/授权动作并返回地址保存与手动刷新结果；服务/账号或连接边界变化时取消旧事实请求，防止迟到数据与错误跨会话回填；账号/MCP 授权查询有截止时间，成功后刷新连接事实，取消和账号切换停止旧查询。
src/account-view.tsx: 复用宿主 Button/tokens 呈现账号摘要、只读地址/设备/版本和刷新进度/成功失败反馈/退出/卸载；Server 编辑只出现在无活动会话的门禁，保存成功才收起；保留账号/MCP tab，插件入口交给官方同步管理页；每服务独立 MCP 卡片、实际连接/数字目录入口/三行短预览与仅截断时按需渲染全文及本机启用、禁用、断开语义、OAuth 重新授权/等待/取消动作与原样认证值输入提示、官方 close 门禁联动和窄屏导航适配。
src/confirm-action.tsx: 复用 Harness 共享 Modal/Button 的页面确认，封闭焦点并隔离外层 Escape，只有明确确认才调用业务动作，供账号与卸载入口共用。
src/plugin-manager/: 官方 `ui-plugin-manager` RC1 fork；保留官方页面、安装状态机与配置槽位，只替换头部添加按钮为 OwnDsh 插件市场入口。
src/plugin-market.module.css: 复用官方插件行列表 tokens 的市场弹窗与滚动样式，固定弹窗高度、让列表独立滚动并让分类/版本标签贴在标题后。
src/assets.d.ts: 声明官方 ui-primitives 类型入口的 KaTeX CSS 副作用导入，保持依赖严格类型检查，不打入运行包。
src/css-modules.d.ts: 声明本地 CSS Modules 与 CSS 副作用导入类型，供官方风格样式进入严格类型检查。
src/client.tsx: Client 组合根，注册官方插件 main/sidebar 页面、企业市场 shell.overlay 弹窗以及 settings.section/shell.overlay；账号入口集中于设置页，共享脱敏 store；复用官方 remote 事件与连接恢复通知，不建立新连接。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/企业插件目录/MCP DTO 与显式刷新解码，承载 OAuth/API Key 本地动作、严格 OAuth flow 进度与连接意愿/名称简介目录/发现数量/有效呈现事实；企业插件只投影包名、精确版本、安装 spec 和展示元数据，拒绝 Token、正文和本地安装事实。
src/plugin-market.tsx: 官方插件页按钮打开的企业市场弹窗；以官方两行行式列表展示版本与分类标签，搜索与刷新同排、分类另起一行，搜索范围只在输入框占位提示，安装/更新/卸载先经 ConfirmAction 确认再委托官方 pluginManager。
src/session-view.tsx: 会话同步 tab 的逐 Session 状态、远端 cursor 列表、恢复目录、新 ID 恢复与二次确认删除呈现。
tests/account-store.spec.ts: MCP 授权成功/失败/取消/截止时间及账号切换迟到隔离； 手动刷新进度/失败/重试、保存成败与动作串行、退出错误后的本地状态收敛、服务/账号切换的迟到数据与错误隔离，以及有界登录查询和 Session 零请求测试。
tests/account-view.spec.ts: 锁定门禁放行、Server 编辑状态白名单和企业目录 semver 安装/更新判定。
tests/client.spec.ts: 官方 plugin main/sidebar、OwnDsh settings/shell.overlay slot 的注册身份、顺序和共享注入测试。
tests/local-api.spec.ts: Server/账号/卸载/企业插件目录/MCP 工具简介白名单/计数一致/呈现与发现/Session DTO、固定路径、OAuth flow 绑定、脱敏投影、显式刷新与秘密字段拒绝测试。
tests/session-view.spec.ts: 锁定十一种同步状态文案、删除不重传与分叉停止语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
