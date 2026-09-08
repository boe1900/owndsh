<!--
[INPUT]: 依赖 EnterprisePlatformService、官方 settings/credentials、同源本地 API 和 Host 认证实现。
[OUTPUT]: 提供 Server 地址、平台方法、Access/Refresh 生命周期与本地路由安全边界说明。
[POS]: @owndsh/platform-client 的公开语义入口，连接 Host 认证核心与浏览器插件调用面。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# @owndsh/platform-client

Harness Host 的企业平台控制面。`EnterprisePlatformService` 通过 Cordis 注册
`ctx.enterprisePlatform`，并公开以下方法：

| 方法 | 职责 |
|---|---|
| `setServerUrl()` | 校验 Server origin，写入 Harness 官方 settings，并清除旧 Server 的认证状态。 |
| `startLogin()` | 幂等启动系统浏览器 PKCE，立即返回 flow ID，后台完成 Token/enroll/bootstrap。 |
| `logout()` | 尝试注销中心会话，并无条件删除本地 GrantRecord 与内存认证状态。 |
| `status()` | 返回连接状态、平台 origin、脱敏用户、revision、连接时间和稳定错误码。 |
| `bootstrap()` | 返回最新已校验脱敏快照的副本。 |
| `refresh()` | 用户打开设置或主动刷新时加载 bootstrap；并发调用共享任务，离线启动可在此重试。 |
| `subscribe()` | 订阅 Host 内存状态副本；幂等 disposer 只移除当前监听器。 |
| `request()` | 执行同源、带认证且可取消的平台 fetch；这是唯一读取 Token 的代码路径。 |
| `dispose()` | 取消登录/刷新/请求，关闭本地路由，等待工作停稳。 |

`baseUrl` 只是安装层可选默认值。未提供时 Service 进入 `UNCONFIGURED`，员工在全屏门禁中填写
Server 地址；地址通过 `@deepseek-ai/dsh-settings` 持久化到 `$DSH_HOME/settings.yaml` 的
`owndsh.serverUrl`。地址必须是不含 user-info、path、query 或 fragment 的 HTTP 或 HTTPS origin；
传输安全由部署方决定，公网和生产部署推荐 HTTPS。普通请求超时 30 秒、dispose 超时 3 秒。
闲置时不轮询 bootstrap、不提前续期、不建立企业状态 SSE。用户请求发现 Access Token 到期时
共享一次轮换；服务端先返回认证 401 时，对可重放请求体最多续期重试一次，403 权限拒绝不触发登出。
`Accept` 包含 `text/event-stream` 的模型流不设置总时限，仍服从调用方取消、Service dispose 和服务端流超时。
网络失败保留 Refresh Grant 与已校验 bootstrap；明确认证失效或设备撤销才删除凭据并阻断。
会话代次校验阻止注销、切换 Server 和销毁后旧异步结果恢复认证或配置。

Service 在 `$DSH_HOME/enterprise/device.json` 只持久化 installation UUID v4、显示名和
创建时间。12 小时 Access Token 只位于 Host 内存；绝对有效 30 天的 Refresh Token 以
`owndsh/platform` GrantRecord 交给官方 `ctx.credentials` provider 保存并单次轮换，不写入 settings、
Session、日志或 installation 文件。Host 重启只尝试一次静默恢复；Server 暂不可达时进入 `REFRESHING`，
等待用户打开设置或主动刷新重试。任何平台 Token 都不会通过本地 HTTP 返回给浏览器。

失败响应通过 contracts 解码为稳定 `EnterprisePlatformError`，只保留 code、retryable、HTTP status
和 requestId。中心 message、details、响应正文与认证 header 不进入异常；LLM adapter 通过 requestId
关联中心审计，而不接触 Token。

本地 Client 只通过 Harness 官方 `ctx.webServer.register()` 同源访问：

- `GET /enterprise/api/v1/local/status`
- `POST /enterprise/api/v1/local/refresh`
- `POST /enterprise/api/v1/local/server`
- `POST /enterprise/api/v1/local/auth/start`
- `POST /enterprise/api/v1/local/auth/cancel`
- `POST /enterprise/api/v1/local/logout`
- `POST /enterprise/api/v1/local/uninstall`
- `GET /enterprise/api/v1/local/bootstrap`
- `GET /enterprise/api/v1/local/plugins`
- `GET /enterprise/api/v1/local/sessions/sync`
- `GET /enterprise/api/v1/local/sessions?cursor=&limit=`
- `POST /enterprise/api/v1/local/sessions/{id}/copies`
- `DELETE /enterprise/api/v1/local/sessions/{id}`

POST action 必须使用 `application/json`；刷新、登录、取消、退出和卸载使用严格空对象 `{}`，Server
更新只接受 `{ "serverUrl": "http://..." }` 或 `{ "serverUrl": "https://..." }`。本地 API 不配置 CORS。Session 恢复 action 的 body 只接受 `{ "targetCwd": "..." }`，成功返回 `201`；列表 limit
范围为 1 至 200。Session 删除只接受路径 ID，成功返回不含正文的 tombstone；路由不接受任意平台 URL。插件与 Session 状态都由 bundle 通过最小反转端口接入，platform-client 不反向依赖
distribution 或 session-sync 包；`/events` 已移除。UI 复用 Harness 官方模型/凭据/设置事件读取本地状态，
仅登录事务期间每秒查询一次，终态、卸载订阅或 330 秒截止时停止。返回值不含
tgz 路径、公钥、CLI 输出、Session 正文或 Token。Session-copy 技术探针已退役；V1 bundle
不挂载 Session Service，保留的 Session 路由在未接入 Service 时返回不可用，不触发同步或恢复。
