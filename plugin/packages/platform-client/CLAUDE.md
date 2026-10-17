# platform-client/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 平台客户端使用与安全边界，记录可选安装默认值、官方 SettingsForms 地址持久化、本地 API 和 Token 不出 Host 约束。
package.json: 私有 workspace package 清单，声明 caret-compatible Cordis/credentials/settings/Schemastery peers、T02 contracts 与 strict Zod 运行依赖。
tsconfig.json: Host TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap 到 `lib/`。
src/browser.ts: 通过无 shell argv 调用系统 URL/文件 opener，向 PKCE 事务和技能编辑/目录动作提供可取消 Host 交接。
src/index.ts: package 公开入口，集中导出 Service、PKCE、installation、bootstrap 与本地 API 契约。
src/installation.ts: 统一解析 DSH_HOME 并原子维护 `enterprise/device.json`，严格限定 UUID v4、显示名和创建时间。
src/local-api.ts: exact/prefix 同源路由暴露企业目录元数据、整包卸载、可安装目录、技能清单/图标/安装/启用/卸载和 Host 文件动作，以及 Server/账号/Session JSON 与显式刷新；插件安装、更新、启停和卸载均由官方 Host Remote 承担，执行端口由 bundle 反向注入以避免依赖环。
src/pkce.ts: PKCE S256 生成、仅绑定 `127.0.0.1` 的 callback、state/取消/超时生命周期；保留回调 iss 供官方 MCP OAuth SDK 校验，启动前或监听期间取消也由 callback.result 返回稳定失败，不泄漏未处理拒绝。
src/platform-credentials.ts: 独占官方 GrantRecord 与内存 Access Token，在 credentials 原子修改边界内轮换 Refresh Token，并阻止过期 origin 或已销毁 Service 重新装载认证态。
src/platform-service.ts: 注册 `ctx.enterprisePlatform`，通过官方 SettingsForms 写入 volatile `owndsh.baseUrl`，将运行时 Server 修改收敛到无活动会话时的凭据清理与 settings 写入，保存期间禁止登录；同时持有 OwnDsh skill runtime，编排技能启用/卸载/图标读取、受控文件打开和可选 Composer 接缝；继续负责登出、带退避的启动恢复、按需续期/401 单次重放、会话代次隔离、显式 bootstrap 刷新与插件 inventory replacement 上报。
src/skill-runtime.ts: OwnDsh 专用 `$DSH_HOME/enterprise/skills/` 的本地真相层；解析 WorkBuddy frontmatter，接收平台已鉴权制品并完成 SHA-256/原子同步，读出脱敏卡片，原子维护设备级启用清单和卸载，动作入口复核完整副本并拒绝符号链接，再通过显式回调通知官方 provider 失效；不直连远端或其他 skill 根目录。
src/skill-archive.ts: 员工端制品信任边界；以标准库解压 ZIP，限制大小/文件数，拒绝路径穿越、重复文件、加密项和符号链接，并校验 CRC。
src/types.ts: 复用生成 RuntimePluginAssignment 严格校验必填安装配置，避免 bootstrap 与目录 schema 重复。
tests/installation.spec.ts: 并发首次启动、0600 权限、字段白名单与损坏文件 fail-closed 验收。
tests/skill-runtime.spec.ts: OwnDsh skill 根目录隔离、WorkBuddy 元数据投影、启用串行化、provider 失效、原子卸载和坏目录/symbolic link 拒绝。
tests/local-api.spec.ts: 真实 Node HTTP 下的 Server 更新、整包卸载、平台/插件/技能目录与安装/Session 路由、严格 DTO、无 SSE、显式刷新、探针退役与 disposer 验收。
tests/pkce.spec.ts: S256、精确 callback、state、启动前/监听期间取消和超时的 Vitest 验收。
tests/platform-service.spec.ts: 真实 socket 下验证安装配置 bootstrap、退出后才可修改 Server、通用 settings 不可绕过、保存/认证互斥与旧账号不复活，以及 GrantRecord 恢复、瞬时启动失败退避重试、按需轮换、超时、闲置零请求和退出竞态。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
