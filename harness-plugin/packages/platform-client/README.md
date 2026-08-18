# @enterprise-agent/dsh-platform-client

Harness Host 的企业平台控制面。`EnterprisePlatformService` 通过 Cordis 注册
`ctx.enterprisePlatform`，并固定公开以下六个方法：

| 方法 | 职责 |
|---|---|
| `startLogin()` | 幂等启动系统浏览器 PKCE，立即返回 flow ID，后台完成 Token/enroll/bootstrap。 |
| `logout()` | 尝试注销中心会话，并无条件清空本地内存认证状态。 |
| `status()` | 返回连接状态、脱敏用户、revision、连接时间和稳定错误码。 |
| `bootstrap()` | 返回最新已校验脱敏快照的副本。 |
| `request()` | 执行同源、带认证且可取消的平台 fetch；这是唯一读取 Token 的代码路径。 |
| `dispose()` | 取消登录/刷新/请求，关闭 SSE 和本地路由，等待工作停稳。 |

`baseUrl` 必须是不含 user-info、path、query 或 fragment 的 HTTPS origin。默认
bootstrap 刷新周期 60 秒、请求超时 30 秒、dispose 超时 3 秒。

Service 在 `$DSH_HOME/enterprise/device.json` 只持久化 installation UUID v4、显示名和
创建时间。平台 Token 只位于 Host 内存，不写入设置、凭据、Session、日志或
installation 文件，也不会通过本地 HTTP/SSE 返回给浏览器。

本地 Client 只通过 Harness 官方 `ctx.webServer.register()` 同源访问：

- `GET /enterprise/api/v1/local/status`
- `POST /enterprise/api/v1/local/auth/start`
- `POST /enterprise/api/v1/local/auth/cancel`
- `POST /enterprise/api/v1/local/logout`
- `GET /enterprise/api/v1/local/bootstrap`
- `GET /enterprise/api/v1/local/events`

POST action 必须使用 `application/json` 且 body 为严格空对象 `{}`。本地 API 不配置
CORS。T01 Session-copy 技术 seam 仅在验收 overlay 显式开启，发行 patch 默认关闭。
