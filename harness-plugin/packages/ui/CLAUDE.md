# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 员工账号 Client 边界说明，记录三个官方 slot、共享 store、同源 API 与 footer 导航限制。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/account-store.ts: 三个 UI slot 与 Settings tabs 共享的外部状态控制器，引用计数管理 SSE、账号动作和插件状态刷新。
src/account-view.tsx: 账号/插件 settings、sidebar 状态和登录 onboarding 呈现，固定连接/插件状态文案与稳定错误映射。
src/client.tsx: Client 组合根，通过官方 `settings.section`、`sidebar.footer.action` 与 `settings.onboarding` 注册共享 store。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
src/local-api.ts: 固定同源路径的严格账号/插件 DTO 与 SSE 解码，插件投影删除 SHA/marker 并拒绝 Token/执行细节。
tests/account-store.spec.ts: 共享状态、动作串行、READY bootstrap/插件加载、SSE 生命周期与错误收敛测试。
tests/account-view.spec.ts: 锁定十一种受管插件状态文案以及重启/失败员工语义。
tests/client.spec.ts: 三个官方 slot 的注册身份、顺序和共享注入测试。
tests/local-api.spec.ts: 账号/插件 DTO、固定路径、空对象 POST、脱敏投影、SSE 与秘密字段拒绝测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
