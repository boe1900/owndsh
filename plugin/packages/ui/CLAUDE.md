# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方 UI 零分叉、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离；官方 ui-primitives 只用于开发类型检查，发行时使用 Harness 共享实例；semver 比较企业与本机版本，避免将回滚或构建元数据误报为更新。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 官方 slot 共享的状态控制器，串行处理 Server、账号、插件和 MCP 状态/授权动作并返回地址保存与手动刷新结果；服务/账号或连接边界变化时取消旧事实请求，防止迟到数据与错误跨会话回填；账号/MCP 授权查询有截止时间，成功后刷新连接事实，取消和账号切换停止旧查询。
src/account-view.tsx: 复用宿主 Button/tokens 呈现账号摘要、只读地址/设备/版本和刷新进度/成功失败反馈/退出/卸载；Server 编辑只出现在无活动会话的门禁，保存成功才收起；保留插件/MCP tab、每服务独立 MCP 卡片、实际连接/数字目录入口/三行短预览与仅截断时按需渲染全文及本机启用、禁用、断开语义、OAuth 重新授权/等待/取消动作与原样认证值输入提示、官方 close 门禁联动和窄屏导航适配。
src/confirm-action.tsx: 复用 Harness 共享 Modal/Button 的页面确认，封闭焦点并隔离外层 Escape，只有明确确认才调用业务动作，供账号与卸载入口共用。
src/plugin-market.tsx: 按产品原型组织分段筛选/搜索、横向分类和无图标紧凑等高卡片，整卡点击进入详情、不另占详情提示行，卡片及焦点轮廓使用宿主 Agent 预设同款 20px 圆角，使用宿主组件与主题承载深色安装、浅灰已启用、浅黄更新按钮；四色状态支持 Tooltip/键盘聚焦，semver 仅对更高版本微闪并尊重减少动态效果；详情以名称/版本/作者、完整简介和分类/来源两块呈现，隐藏安装技术字段，仅按需提示异常/待重启/目录变化；固定版本安装与卸载确认仍走 Host，保留上游 MIT 声明。
src/assets.d.ts: 声明官方 ui-primitives 类型入口的 KaTeX CSS 副作用导入，保持依赖严格类型检查，不打入运行包。
src/client.tsx: Client 组合根，仅通过 settings.section/shell.overlay 注册 OwnDsh 设置和访问门禁，账号入口集中于设置页，共享脱敏 store；复用官方 remote 事件与连接恢复通知，不建立新连接。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/插件/MCP DTO 与显式刷新解码，承载 OAuth/API Key 本地动作、严格 OAuth flow 进度与连接意愿/名称简介目录/发现数量/有效呈现事实，过滤内部版本 ID/marker 并拒绝 Token、正文和执行细节。
src/session-view.tsx: 会话同步 tab 的逐 Session 状态、远端 cursor 列表、恢复目录、新 ID 恢复与二次确认删除呈现。
tests/account-store.spec.ts: MCP 授权成功/失败/取消/截止时间及账号切换迟到隔离； 手动刷新进度/失败/重试、保存成败与动作串行、退出错误后的本地状态收敛、服务/账号切换的迟到数据与错误隔离，以及有界登录查询和 Session 零请求测试。
tests/account-view.spec.ts: 锁定门禁放行、Server 编辑状态白名单、受管插件和重启/失败员工语义，以及四色状态、升级/回滚/预发布/构建元数据的版本提示。
tests/client.spec.ts: Settings/shell.overlay 两个官方 slot 的注册身份、顺序和共享注入测试，拒绝侧栏账号与额外市场入口。
tests/local-api.spec.ts: Server/账号/卸载/插件/MCP 工具简介白名单/计数一致/呈现与发现/Session DTO、固定路径、OAuth flow 绑定、脱敏投影、显式刷新与秘密字段拒绝测试。
tests/session-view.spec.ts: 锁定十一种同步状态文案、删除不重传与分叉停止语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
