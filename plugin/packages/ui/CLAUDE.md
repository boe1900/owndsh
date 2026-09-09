# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方 UI 零分叉、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离；官方 ui-primitives 只用于开发类型检查，发行时使用 Harness 共享实例。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 官方 slot 共享的状态控制器，串行处理 Server、账号和插件动作并返回地址保存结果；服务/账号或连接边界变化时取消旧事实请求，防止迟到数据与错误跨会话回填；登录查询有截止时间。
src/account-footer.tsx: 官方 sidebar footer slot 的 OwnDsh 账户行，使用品牌图标、显示名和灰色确认退出按钮；插件管理归设置页，不劫持 Settings 私有状态。
src/account-view.tsx: 复用宿主 Button/tokens 呈现账号摘要、只读地址/设备/版本和刷新/退出/卸载；Server 编辑只出现在无活动会话的门禁，保存成功才收起；保留插件 tab、官方 close 门禁联动和窄屏导航适配。
src/confirm-action.tsx: 复用 Harness 共享 Modal/Button 的页面确认，封闭焦点并隔离外层 Escape，只有明确确认才调用业务动作，供账号与卸载入口共用。
src/plugin-market.tsx: OwnDsh 设置内的插件管理视图，分离目录和本机库存并承载显式安装/卸载；校验状态统一描述完整性与兼容性，适配可选验签；详情弹窗管理焦点并隔离外层 Settings 的 Escape。
src/assets.d.ts: 声明官方 ui-primitives 类型入口的 KaTeX CSS 副作用导入，保持依赖严格类型检查，不打入运行包。
src/client.tsx: Client 组合根，通过三个官方 slot 注册账号/插件设置、侧栏账户行和访问门禁，共享脱敏 store；复用官方 remote 事件与连接恢复通知，不建立新连接。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/插件/Session DTO 与显式刷新解码，删除 SHA/hash/marker 并拒绝 Token、正文和执行细节。
src/session-view.tsx: 会话同步 tab 的逐 Session 状态、远端 cursor 列表、恢复目录、新 ID 恢复与二次确认删除呈现。
tests/account-store.spec.ts: 保存成败与动作串行、退出错误后的本地状态收敛、服务/账号切换的迟到数据与错误隔离，以及有界登录查询和 Session 零请求测试。
tests/account-view.spec.ts: 锁定门禁放行、Server 编辑状态白名单、受管插件和重启/失败员工语义。
tests/client.spec.ts: Settings/sidebar/shell.overlay 三个官方 slot 的注册身份、顺序和共享注入测试，拒绝额外市场入口。
tests/local-api.spec.ts: Server/账号/卸载/插件/Session DTO、固定路径、脱敏投影、显式刷新与秘密字段拒绝测试。
tests/session-view.spec.ts: 锁定十一种同步状态文案、删除不重传与分叉停止语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
