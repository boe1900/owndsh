# T01 技术刺探验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T01 已按 DeepSeek Harness 官方支持的插件路线通过。产品不再把自定义 Typert Remote contribution 作为普通树外插件的前置条件，而是使用以下稳定组合面：

- Host：Cordis `apply(ctx)`、service inject 和 `ctx.webServer.register()`。
- 发布：`dsh.bundle`、`cordis.patch.yml`、裸包名 Loader row 和预构建 `.tgz`。
- Client：`dsh.client`、官方 lazy-CJS factory 和 UI slots。
- 企业私有 Host/Client 协作：同源 `/enterprise/api/v1/local/*` HTTP/SSE，不修改上游 Remote 集合。

锁定 Harness commit 为 `47f943859bef60e4160492346772ded9b24f765a`（`0.1.0-rc.5`）。验收前后同级 `deepseek-harness` 均位于该 commit，`git status --porcelain` 为空，没有修改任何上游文件。

## 路线修正

官网[插件基础教程](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)、[参考文档](https://deepseek-harness.github.io/deepseek-harness/reference/)、锁定源码和验收时官方最新 `master` `99f6f02` 一致表明：普通插件的入口是 Cordis `apply(ctx)` 和 package/profile 元数据；Client 模块由 Loader row 与 `dsh.client` 发现。`typertPlugin({ mode: 'package' })` 服务于 Harness 自身 Typert workspace 的代码生成，不是所有树外插件必须经过的发布入口。

2026-08-17 的试验确实稳定复现过：树外 package 直接消费已安装的 `@deepseek-ai/dsh-typert-protocol` 时，生成器不能把 ESM 声明识别为 workspace 内的 Remote 元符号，并报错：

```text
TypertAnalysisError: typert(host): @owndsh/platform-client publishes Remote artifacts but has no Remote methods
```

这个结果说明“树外自行生成 Typert Remote”路线不成立，但不说明 Harness 官方插件机制失效。原设计把该内部生成路线误当成企业插件必经路线，现已修订详细设计第 3、4、8、16、18、19、20 和 22 节。产品仍拒绝 ambient protocol shim、跨仓库源码 project reference、复制上游源码、手写 Remote contribution 和修改 `@deepseek-ai/dsh-api-remotes`；这些绕过既无必要，也不能形成真实发布证据。

## 正式实现

| 模块 | T01 证明内容 |
|---|---|
| `packages/platform-client` | PKCE S256、仅绑定 `127.0.0.1` 的随机端口 callback、state/取消/超时，以及严格方法、content-type、256 KiB 请求上限和脱敏 DTO 的本地 API。 |
| `packages/llm-gateway` | OpenAI-compatible SSE 分块、多 `data:`、非 2xx、流内 error、缺失 `[DONE]` 断流和 AbortSignal 取消。 |
| `packages/session-sync` | `ctx.sessions.create(newId, { seed, meta })` 创建新副本、lineage 元数据和 `ctx.sessions.flush()` 持久化检查点。 |
| `packages/ui` | `dsh.client` Client half、同源状态 fetch、Lucide 图标和 `sidebar.footer.action` 注册。 |
| `packages/bundle` | 自包含 Host ESM、官方 lazy-CJS Client factory、`dsh.bundle`、`dsh.client` 和 `cordis.patch.yml`。 |
| `owndsh-server` test | Sa-Token `deviceType=harness`、不同 `deviceId`、`is-share=false` 和单 Token 注销隔离。 |

所有新增 TypeScript/Java 业务与测试文件均有 L3 契约；`plugin/packages/`、各正式 package、组合脚本和后端测试目录均有 L2 地图，根 L1 已同步当前阶段。

## 自动验收

插件 workspace 实际执行：

```sh
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run check
corepack pnpm@11.7.0 run pack:bundle
node scripts/t01-harness-smoke.mjs \
  --tgz ../artifacts/owndsh-plugin-0.1.0.tgz
```

结果：20 个 package Vitest、4 个 workspace 不变量、TypeScript typecheck/build 全部通过。组合脚本先在全新临时 consumer 中安装 `.tgz` 并直接 `import('owndsh-plugin')`，再通过官方 CLI 安装到临时 Harness `web` profile；consumer 和 bundle 均不包含 ambient shim 或同级 Harness 源码路径。

真实组合 smoke 输出：

```json
{
  "clientBundle": "/plugins/owndsh-plugin/client.js?rev=87fe23ea2f33",
  "harnessCommit": "47f943859bef60e4160492346772ded9b24f765a",
  "packageConsumer": "passed",
  "profile": "web",
  "sessionSeed": "passed",
  "statusApi": "passed"
}
```

后端实际执行：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-server -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=SaTokenDeviceSessionTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

结果：`Tests run: 1, Failures: 0, Errors: 0`，35 个 Maven reactor 模块成功。

仓库边界实际执行：

```sh
./scripts/bootstrap-harness.sh --check-only
node scripts/upstream-baseline.mjs verify
git diff --check
```

三个检查均通过；产品仓库不包含 Harness 源码，同级 checkout 保持锁定且干净。

## 真实浏览器验收

从组合脚本生成的临时 `web` profile 启动 Harness Web，在真实页面完成首次启动引导后验收：

- 默认桌面视口中 footer 显示“企业”，可访问名称为“企业服务已连接”。
- 点击企业入口会重新请求同源状态 API，完成后仍为 ready。
- 390×844 窄视口中入口收敛为固定宽度图标，仍保留可访问名称和刷新行为。
- 两个视口均未发现控件或文字重叠，页面 console 无 warning/error。

浏览器页、Harness 进程和临时 `DSH_HOME` 已在验收后关闭并清理。

## 任务边界

T01 只证明关键框架语义与官方插件发布链，不提前实现 T02 协议骨架或 T06/T07 的完整平台登录状态机。`session-copies` 是仅由验收 overlay 开启的技术路由，发行 patch 默认关闭；正式 Session API 仍按详细设计第 16、17 节由后续任务实现。T02 可以作为下一项独立任务开始，但尚未实施。
