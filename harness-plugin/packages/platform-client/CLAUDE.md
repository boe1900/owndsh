# platform-client/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 平台客户端边界说明，记录 T01 的 PKCE 与同源本地 API 职责，以及不持有浏览器 Token 的安全边界。
package.json: 私有 workspace package 清单，公开 Host 辅助接口并固定 Cordis `4.0.1` 类型契约。
tsconfig.json: Host TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap 到 `lib/`。
src/index.ts: package 公开入口，集中导出 PKCE 与本地 API 契约。
src/local-api.ts: `ctx.webServer.register()` 结构化端口、本地状态 DTO 与 T01 Session 恢复探针路由。
src/pkce.ts: PKCE S256 生成、仅绑定 `127.0.0.1` 的 callback、state/取消/超时生命周期。
tests/local-api.spec.ts: 真实 Node HTTP 下的方法、content-type、体积、DTO、探针开关与 disposer 验收。
tests/pkce.spec.ts: S256、精确 callback、state、取消和超时的 Vitest 验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
