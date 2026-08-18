# T06 Harness 平台客户端验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T06 已完成，且没有进入 T07。`@enterprise-agent/dsh-platform-client` 已从 T01 技术原语提升为
Cordis `ctx.enterprisePlatform` Service，公开面固定为 `startLogin()`、`logout()`、`status()`、
`bootstrap()`、`request()` 和 `dispose()`。bundle 继续使用 Harness 官方 `apply(ctx)`、
`dsh.bundle`、`dsh.client` 和 `ctx.webServer.register()` 路线，没有引入自定义 Typert Remote。

锁定 Harness commit 仍为 `47f943859bef60e4160492346772ded9b24f765a`（`0.1.0-rc.5`）。
验收前后同级 `deepseek-harness` 工作区均为空，本任务没有修改上游文件。

## 核心实现

- PKCE 登录以 flow ID 幂等启动，只绑定 `127.0.0.1` 随机端口，完成 state/S256 校验后交换
  `dsh-desktop` Token，再串行 enroll 和 bootstrap。浏览器通过无 shell argv 的系统 opener 启动。
- 连接状态覆盖 `SIGNED_OUT`、`AUTHORIZING`、`ENROLLING`、`BOOTSTRAPPING`、`READY`、
  `CANCELLED`、`FAILED`、`REFRESHING`、`AUTH_EXPIRED` 和 `DEVICE_REVOKED`。只有 `READY` 允许普通企业请求。
- bootstrap 默认每 60 秒刷新；revision 不变时仍更新最后连接时间。临时失败使用
  1、2、4…秒指数退避，上限 60 秒；认证过期或设备撤销会清空内存会话并进入终态。
- `request()` 是唯一读取 Token 的代码路径。它只允许平台同源 URL，拒绝 user-info、跨源地址和
  调用方提供的 `Authorization`，禁止认证 redirect，并统一跟随 AbortSignal/超时/dispose。
- `$DSH_HOME/enterprise/device.json` 用原子独占创建维护，文件模式为 `0600`，只包含
  installation UUID v4、显示名和创建时间。损坏或多字段文件 fail closed，不会静默重置身份。
- 同源本地控制面提供 status、auth start/cancel、logout、bootstrap 和 events SSE。POST action 严格要求
  `application/json` 与 `{}` DTO，请求上限 256 KiB，不配置 CORS，响应和 SSE 均不序列化 Token。

T08 尚未提供真实 Server bootstrap Controller。T06 没有在发行代码中嵌入 mock；而是对详细设计
第 8 节 DTO 做 strict Zod 校验，并在真实 Node HTTP 假平台测试中验证完整生命周期。

## 自动化验收

受影响包定点门禁：

```sh
corepack pnpm@11.7.0 --filter @enterprise-agent/dsh-platform-client test
corepack pnpm@11.7.0 --filter @enterprise-agent/dsh-platform-client typecheck
corepack pnpm@11.7.0 --filter @enterprise-agent/dsh-platform-client build
```

结果：4 个 Vitest 文件、18 项测试全部通过。测试覆盖 HTTPS origin 负例、回环/state/伪造 state/取消/超时、并发 installation、
真实 HTTP 本地 API/SSE、登录串行、Token 重启丢失、revision 刷新、指数退避、恢复、撤销、
AbortSignal 和 dispose 停稳。

插件 workspace 实际执行：

```sh
corepack pnpm@11.7.0 run check
```

结果：生成无漂移，6 个 package 的 typecheck/build 全部通过；contracts 4、llm-gateway 4、
platform-client 18、session-sync 3、UI 2、bundle 3 以及 workspace 4 项测试全部通过。

## 真实包消费与 Harness 组合

platform-client 和 contracts 先构建为真实 tgz，再安装到全新 consumer：

```sh
corepack pnpm@11.7.0 run pack:platform-client
corepack pnpm@11.7.0 run smoke:platform-client
```

结果：安装后的 `lib/index.js` 和 `lib/platform-service.js` 可直接 ESM import，installation 可创建；
package manifest 已把 `workspace:*` 收敛为 `0.1.0`，产物中不存在 ambient Typert shim 或同级 Harness 路径。

bundle 构建后安装到未修改的锁定 Harness `web` profile：

```sh
corepack pnpm@11.7.0 run pack:bundle
node scripts/t01-harness-smoke.mjs \
  --tgz ../artifacts/enterprise-agent-dsh-bundle-0.1.0.tgz
```

真实组合输出：

```json
{
  "clientBundle": "/plugins/@enterprise-agent/dsh-bundle/client.js?rev=87fe23ea2f33",
  "harnessCommit": "47f943859bef60e4160492346772ded9b24f765a",
  "installationFile": "non-secret",
  "localEvents": "passed",
  "packageConsumer": "passed",
  "profile": "web",
  "sessionSeed": "passed",
  "statusApi": "passed"
}
```

该 smoke 从真实 Harness Web server 访问脱敏 status 和 events SSE，检查预构建 Client bundle 可发现，
并验证 Cordis 卸载时 Web 进程在限时内停稳。

## 边界门禁

```sh
./scripts/bootstrap-harness.sh --check-only
node scripts/upstream-baseline.mjs verify
git diff --check
```

三项均通过。产品源码不导入同级 Harness，不生成 Typert Remote，本任务没有添加 T07 UI、
T08 Server bootstrap、T11 模型 adapter 或 Session/plugin 正式业务路由。下一项只能从 T07 开始。
