# platform-client/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 平台客户端使用与安全边界，记录可选安装默认值、官方 settings 地址持久化、本地 API 和 Token 不出 Host 约束。
package.json: 私有 workspace package 清单，声明 caret-compatible Cordis/credentials/settings/Schemastery peers、T02 contracts 与 strict Zod 运行依赖。
tsconfig.json: Host TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap 到 `lib/`。
src/browser.ts: 通过无 shell argv 调用系统 URL opener，向 PKCE 事务提供可取消桌面浏览器交接。
src/index.ts: package 公开入口，集中导出 Service、PKCE、installation、bootstrap 与本地 API 契约。
src/installation.ts: 统一解析 DSH_HOME 并原子维护 `enterprise/device.json`，严格限定 UUID v4、显示名和创建时间。
src/local-api.ts: exact/prefix 同源路由暴露企业目录、严格 package/version 安装与 package 卸载动作，以及 Server/账号/Session JSON 与显式刷新；执行端口由 bundle 反向注入以避免依赖环。
src/pkce.ts: PKCE S256 生成、仅绑定 `127.0.0.1` 的 callback、state/取消/超时生命周期。
src/platform-credentials.ts: 独占官方 GrantRecord 与内存 Access Token，在 credentials 原子修改边界内轮换 Refresh Token，并阻止过期 origin 或已销毁 Service 重新装载认证态。
src/platform-service.ts: 注册 `ctx.enterprisePlatform`，将运行时 Server 修改收敛到无活动会话时的凭据清理与官方 settings 写入，保存期间禁止登录；编排登出、启动恢复、按需续期/401 单次重放、会话代次隔离与显式 bootstrap 刷新。
src/types.ts: 复用生成契约严格校验 Bootstrap、模型、配额与受管插件，定义公共 Service 配置、稳定错误及无秘密状态 DTO。
tests/installation.spec.ts: 并发首次启动、0600 权限、字段白名单与损坏文件 fail-closed 验收。
tests/local-api.spec.ts: 真实 Node HTTP 下的 Server 更新、整包卸载、平台/插件/Session 路由、严格 DTO、无 SSE、显式刷新、探针退役与 disposer 验收。
tests/pkce.spec.ts: S256、精确 callback、state、取消和超时的 Vitest 验收。
tests/platform-service.spec.ts: 真实 socket 下验证退出后才可修改 Server、通用 settings 不可绕过、保存/认证互斥与旧账号不复活，以及 GrantRecord 恢复、按需轮换、超时、闲置零请求和退出竞态。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
