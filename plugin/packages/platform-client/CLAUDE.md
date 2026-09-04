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
src/platform-service.ts: 注册 `ctx.enterprisePlatform`，承载七方法请求面、普通控制面限时与 SSE 无总时限策略、上游 Retry-After 投影、成功静默且失败退避的 bootstrap 轮询、隔离状态订阅者的认证生命周期和 dispose。
src/types.ts: 复用生成契约严格校验 Bootstrap 配额并将 Token int64 收窄为浏览器安全整数，同时校验模型 reasoningEfforts 三态、T13 签名/compatibility/ABSENT，定义平台状态和用户 DTO。
tests/installation.spec.ts: 并发首次启动、0600 权限、字段白名单与损坏文件 fail-closed 验收。
tests/local-api.spec.ts: 真实 Node HTTP 下的平台/插件/Session 分页、恢复、删除路由、DTO、复合 SSE、探针与 disposer 验收。
tests/pkce.spec.ts: S256、精确 callback、state、取消和超时的 Vitest 验收。
tests/platform-service.spec.ts: 真实 socket 下验证登录/bootstrap、状态订阅隔离、控制面超时、延迟 SSE、调用方取消、成功静默轮询、失败退避与停稳。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
