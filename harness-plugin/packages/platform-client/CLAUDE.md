# platform-client/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 平台客户端使用与安全边界，记录 Service 方法、必填 HTTPS 配置、本地 API 和 Token 不出 Host 约束。
package.json: 私有 workspace package 清单，固定 Cordis peer、T02 contracts 与 strict Zod 运行依赖。
tsconfig.json: Host TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap 到 `lib/`。
src/browser.ts: 通过无 shell argv 调用系统 URL opener，向 PKCE 事务提供可取消桌面浏览器交接。
src/index.ts: package 公开入口，集中导出 Service、PKCE、installation、bootstrap 与本地 API 契约。
src/installation.ts: 统一解析 DSH_HOME 并原子维护 `enterprise/device.json`，严格限定 UUID v4、显示名和创建时间。
src/local-api.ts: 通过 exact/prefix route 暴露脱敏平台/插件/Session 分页、恢复、删除 JSON 与复合 SSE，并保留默认关闭的 T01 恢复 seam。
src/pkce.ts: PKCE S256 生成、仅绑定 `127.0.0.1` 的 callback、state/取消/超时生命周期。
src/platform-service.ts: 注册 `ctx.enterprisePlatform`，承载七方法请求面、插件/Session 反转端口、enroll/bootstrap、刷新期间连续认证请求与 dispose。
src/types.ts: 严格校验含 T13 签名/compatibility/ABSENT 的 bootstrap，定义平台状态和用户 DTO。
tests/installation.spec.ts: 并发首次启动、0600 权限、字段白名单与损坏文件 fail-closed 验收。
tests/local-api.spec.ts: 真实 Node HTTP 下的平台/插件/Session 分页、恢复、删除路由、DTO、复合 SSE、探针与 disposer 验收。
tests/pkce.spec.ts: S256、精确 callback、state、取消和超时的 Vitest 验收。
tests/platform-service.spec.ts: 真实 socket 与 Cordis caller proxy 下的登录/enroll/bootstrap、requestId、内存 Token、刷新连续请求/退避、撤销、取消与停稳验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
