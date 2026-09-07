# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方 UI 零分叉、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离；官方 ui-primitives 只用于开发类型检查，发行时使用 Harness 共享实例。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 三个 UI slot 共享的外部状态控制器，串行处理 Server、账号与卸载动作，只在连接/revision 变化时重载账号/插件事实；V1 不自动读取 Session。
src/account-footer.tsx: 官方 sidebar footer slot 的 OwnDsh 账户行，以宿主同高 hover、同规格鲸鱼图标、显示名和灰色确认退出按钮呈现账号；宿主未开放 Settings 导航能力，因此不劫持其私有状态。
src/account-view.tsx: 对齐宿主 tokens 的账号/插件 settings 与共享页面登出确认，账号阻断时通过官方 close 关闭设置页；以 Server 编辑、状态线和封闭焦点呈现品牌全屏门禁，并提供整包卸载。
src/confirm-action.tsx: 复用 Harness 共享 Modal/Button 的页面确认，封闭焦点并隔离外层 Escape，只有明确确认才调用业务动作，供账号与卸载入口共用。
src/assets.d.ts: 声明官方 ui-primitives 类型入口的 KaTeX CSS 副作用导入，保持依赖严格类型检查，不打入运行包。
src/client.tsx: Client 组合根，通过官方 `settings.section`、`sidebar.footer.action` 与 `shell.overlay` 注册 OwnDsh 设置、账户行和共享脱敏 store。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/插件/Session DTO 与复合 SSE 解码，删除 SHA/hash/marker 并拒绝 Token、正文和执行细节。
src/session-view.tsx: 会话同步 tab 的逐 Session 状态、远端 cursor 列表、恢复目录、新 ID 恢复与二次确认删除呈现。
tests/account-store.spec.ts: 共享状态、Server/账号/卸载动作串行、连接/revision 去重、Session 零请求、SSE 生命周期与错误收敛测试。
tests/account-view.spec.ts: 锁定连接/受管插件状态、门禁放行条件以及重启/失败员工语义。
tests/client.spec.ts: Settings/sidebar/shell.overlay 三个官方 slot 的注册身份、顺序和共享注入测试。
tests/local-api.spec.ts: Server/账号/卸载/插件/Session DTO、固定路径、脱敏投影、复合 SSE 与秘密字段拒绝测试。
tests/session-view.spec.ts: 锁定十一种同步状态文案、删除不重传与分叉停止语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
