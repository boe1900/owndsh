# @enterprise-agent/dsh-platform-client

Harness Host 的企业平台控制面。`EnterprisePlatformService` 通过 Cordis 注册
`ctx.enterprisePlatform`，并固定公开以下七个方法：

| 方法 | 职责 |
|---|---|
| `startLogin()` | 幂等启动系统浏览器 PKCE，立即返回 flow ID，后台完成 Token/enroll/bootstrap。 |
| `logout()` | 尝试注销中心会话，并无条件清空本地内存认证状态。 |
| `status()` | 返回连接状态、平台 origin、脱敏用户、revision、连接时间和稳定错误码。 |
| `bootstrap()` | 返回最新已校验脱敏快照的副本。 |
| `subscribe()` | 订阅 Host 内存状态副本；幂等 disposer 只移除当前监听器。 |
| `request()` | 执行同源、带认证且可取消的平台 fetch；这是唯一读取 Token 的代码路径。 |
| `dispose()` | 取消登录/刷新/请求，关闭 SSE 和本地路由，等待工作停稳。 |

`baseUrl` 必须是不含 user-info、path、query 或 fragment 的 HTTPS origin。默认
bootstrap 刷新周期 60 秒、请求超时 30 秒、dispose 超时 3 秒。刷新与退避期间继续使用
内存 Token 和最后一份已校验 bootstrap 服务认证请求；只有明确认证过期或设备撤销才清空会话。

Service 在 `$DSH_HOME/enterprise/device.json` 只持久化 installation UUID v4、显示名和
创建时间。平台 Token 只位于 Host 内存，不写入设置、凭据、Session、日志或
installation 文件，也不会通过本地 HTTP/SSE 返回给浏览器。

失败响应通过 contracts 解码为稳定 `EnterprisePlatformError`，只保留 code、retryable、HTTP status
和 requestId。中心 message、details、响应正文与认证 header 不进入异常；LLM adapter 通过 requestId
关联中心审计，而不接触 Token。

本地 Client 只通过 Harness 官方 `ctx.webServer.register()` 同源访问：

- `GET /enterprise/api/v1/local/status`
- `POST /enterprise/api/v1/local/auth/start`
- `POST /enterprise/api/v1/local/auth/cancel`
- `POST /enterprise/api/v1/local/logout`
- `GET /enterprise/api/v1/local/bootstrap`
- `GET /enterprise/api/v1/local/plugins`
- `GET /enterprise/api/v1/local/sessions/sync`
- `GET /enterprise/api/v1/local/sessions?cursor=&limit=`
- `POST /enterprise/api/v1/local/sessions/{id}/copies`
- `DELETE /enterprise/api/v1/local/sessions/{id}`
- `GET /enterprise/api/v1/local/events`

POST action 必须使用 `application/json` 且 body 为严格空对象 `{}`。本地 API 不配置
CORS。Session 恢复 action 的 body 只接受 `{ "targetCwd": "..." }`，成功返回 `201`；列表 limit
范围为 1 至 200。Session 删除只接受路径 ID，成功返回不含正文的 tombstone；路由不接受任意平台 URL。插件与 Session 状态都由 bundle 通过最小反转端口接入，platform-client 不反向依赖
distribution 或 session-sync 包；复合 SSE 分别发送 `status` 和 `session-sync` event，返回值不含
tgz 路径、公钥、CLI 输出、Session 正文或 Token。T01 Session-copy 技术 seam 仅在验收 overlay 显式
开启，发行 patch 默认关闭。
