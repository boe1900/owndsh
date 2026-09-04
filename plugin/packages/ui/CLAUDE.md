# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工 Client 边界说明，记录官方 UI 零分叉、初装只填 Server、全局门禁、整包卸载与 V1 Session 停用。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 三个 UI slot 共享的外部状态控制器，串行处理 Server、账号与卸载动作，只在连接/revision 变化时重载账号/插件事实；V1 不自动读取 Session。
src/account-view.tsx: 对齐宿主 tokens 的账号/插件 settings、sidebar 状态与内嵌 OwnDsh 品牌鲸图的全屏访问门禁，以单行 Server 编辑、状态线和封闭键盘焦点覆盖未配置/未登录/失效，并提供整包卸载。
src/client.tsx: Client 组合根，通过官方 `settings.section`、`sidebar.footer.action` 与 `shell.overlay` 注册共享脱敏 store。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格 Server/账号/卸载/插件/Session DTO 与复合 SSE 解码，删除 SHA/hash/marker 并拒绝 Token、正文和执行细节。
src/session-view.tsx: 会话同步 tab 的逐 Session 状态、远端 cursor 列表、恢复目录、新 ID 恢复与二次确认删除呈现。
tests/account-store.spec.ts: 共享状态、Server/账号/卸载动作串行、连接/revision 去重、Session 零请求、SSE 生命周期与错误收敛测试。
tests/account-view.spec.ts: 锁定连接/受管插件状态、门禁放行条件以及重启/失败员工语义。
tests/client.spec.ts: Settings/sidebar/shell.overlay 三个官方 slot 的注册身份、顺序和共享注入测试。
tests/local-api.spec.ts: Server/账号/卸载/插件/Session DTO、固定路径、脱敏投影、复合 SSE 与秘密字段拒绝测试。
tests/session-view.spec.ts: 锁定十一种同步状态文案、删除不重传与分叉停止语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
