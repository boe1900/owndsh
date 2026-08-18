# platform-client/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 平台客户端使用与安全边界，记录 Service 方法、必填 HTTPS 配置、本地 API 和 Token 不出 Host 约束。
package.json: 私有 workspace package 清单，固定 Cordis peer、T02 contracts 与 strict Zod 运行依赖。
tsconfig.json: Host TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap 到 `lib/`。
src/browser.ts: 通过无 shell argv 调用系统 URL opener，向 PKCE 事务提供可取消桌面浏览器交接。
src/index.ts: package 公开入口，集中导出 Service、PKCE、installation、bootstrap 与本地 API 契约。
src/installation.ts: 原子维护 `$DSH_HOME/enterprise/device.json`，严格限定 UUID v4、显示名和创建时间。
src/local-api.ts: 通过 `ctx.webServer.register()` 暴露脱敏 JSON/SSE 控制面，并保留默认关闭的 T01 Session 恢复 seam。
src/pkce.ts: PKCE S256 生成、仅绑定 `127.0.0.1` 的 callback、state/取消/超时生命周期。
src/platform-service.ts: 注册 `ctx.enterprisePlatform`，独占内存 Token、状态机、脱敏平台 origin、带认证 fetch、enroll/bootstrap、60 秒刷新与 dispose。
src/types.ts: 严格校验第 8 节 bootstrap 脱敏快照，定义含平台 origin 的本地状态和用户 DTO。
tests/installation.spec.ts: 并发首次启动、0600 权限、字段白名单与损坏文件 fail-closed 验收。
tests/local-api.spec.ts: 真实 Node HTTP 下的方法/content-type/体积/DTO、JSON action、SSE、探针与 disposer 验收。
tests/pkce.spec.ts: S256、精确 callback、state、取消和超时的 Vitest 验收。
tests/platform-service.spec.ts: 真实 socket 假平台下的登录/enroll/bootstrap、内存 Token、刷新退避、撤销、重启、取消与停稳验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
