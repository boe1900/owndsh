# T14 插件客户端验收记录

状态：`completed`

验收日期：2026-08-19（Asia/Shanghai）

## 结论

T14 已完成，且没有进入 T15。企业 bundle 通过 DeepSeek Harness rc.7 官方
`ctx.subprocess` 和 `ctx.pluginInventory` 建立受管插件调和 Service；同级 Harness 没有任何源码或
文件模式修改。客户端下载、四项校验、固定 CLI argv、原子状态、跨进程 Loader 确认、ABSENT、库存
上报与旧版本回滚形成完整闭环。

验证失败只进入 `FAILED`，不会执行 CLI 或标记 active。企业核心 bundle 及其全部产品代码由安装包
拥有，通用分发无法更新或卸载。T14 没有实现插件管理页或员工插件 tab，这些属于 T15。

## 核心实现

- `@enterprise-agent/dsh-plugin-distribution` 在 bootstrap 插件 revision 变化后串行调和，避免多个
  worker 同时改写制品、profile 或状态文件。
- 下载流写入 `$DSH_HOME/enterprise/artifacts/<sha256>.tgz.part`，边读边限制准确字节数并计算
  SHA-256；成功后校验安装包固定的 Ed25519 公钥、RFC 8785 受限签名声明和
  Harness commit/bundle SemVer/OS compatibility，再原子改名。
- 安装 argv 固定为
  `dsh plugin --profile enterprise add --ignore-scripts --save-exact <absolute-tgz>`；移除固定为
  `dsh plugin --profile enterprise remove <package-name>`。两者都通过 `ctx.subprocess.spawn()` 传完整
  argv，不构造 shell 字符串。
- CLI 成功后原子写入权限为 `0600` 的 `managed-plugins.json`。记录只含 package、版本、hash、
  revision、期望状态、稳定错误码和进程 marker，不保存 URL、公钥、平台响应或子进程输出。
- 当前进程写入 `RESTART_REQUIRED` 后不会把已有 Loader row 误判为新版本。只有下一进程 marker
  不同且 `pluginInventory.list()` 返回 enabled/active 才转为 `ACTIVE`；ABSENT 只有在下一进程确认
  row 消失后才从状态与替换式 inventory 删除。
- 升级和降级回滚使用同一个已验签 exact tgz 路径。bundle、contracts、platform client、LLM、
  distribution、Session 和 UI 七个核心 package 均被拒绝。
- platform-client 暴露 `GET /enterprise/api/v1/local/plugins`，bundle 通过只读回调接入 distribution
  状态，保持依赖方向单向；响应不含本地制品路径、信任根、CLI 输出或凭据。

## 自动验收

插件 workspace 完整门禁：

```sh
cd harness-plugin
corepack pnpm@11.7.0 run check
```

结果：7 个产品 package 的 typecheck/build 全部通过；contracts 7 项、session-sync 3 项、UI 7 项、
platform-client 18 项、llm-gateway 14 项、plugin-distribution 11 项、bundle 3 项和 workspace 4 项
不变量全部通过。分发测试覆盖下载中断、大小/hash/signature/compatibility 失败、缓存制品、UTF-16
键序与 Java 同源 JCS 向量、固定 argv、失败不激活、关闭中断后重试、跨进程 active、无 CLI revision
前移、ABSENT、回滚、替换库存和核心保护。

发布包与无 ambient shim consumer：

```sh
corepack pnpm@11.7.0 run pack:plugin-distribution
corepack pnpm@11.7.0 run smoke:plugin-distribution
```

结果：contracts、platform-client、plugin-distribution 三个 `0.1.0` tgz 被安装到全新临时 consumer；
consumer 从发布 `lib` 导入 JCS 与原子状态实现，未借用 workspace、同级 Harness 源码或 Typert ambient
声明。发布 manifest 精确固定 rc.7 subprocess/inventory peers 和 `semver@7.8.4`。

## 真实 rc.7 CLI

```sh
corepack pnpm@11.7.0 run accept:t14-dsh-plugin
```

脚本先断言同级 Harness commit 与 clean worktree，再只使用临时 `DSH_HOME` 和临时测试 tgz。制品路径
刻意包含空格；真实 CLI 在 `enterprise` profile 中完成 `2.0.0` exact add、降级到 `1.0.0`、
`--dump-config` bundle row 调和和 remove。profile 的 dependency 精确指向相应 tgz，移除后 dependency
和 bundle row 同时消失。退出时再次确认 Harness 工作区为空。

既有 T01 本地 API/Client/Session seed 与 T11 真实模型组合 smoke 继续作为最终回归；T01 还从真实
bundle 断言 `/enterprise/api/v1/local/plugins` 的初始 revision 与空清单，证明新增 Schemastery Config、
信任公钥以及 subprocess/inventory inject 没有破坏登录、插件状态读取或无本地上游 Key 模型流。

## Server 与上游回归

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false test

node scripts/upstream-baseline.mjs verify-locks
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

Java 全 reactor、PostgreSQL 17、Redis 8、OpenLDAP、WireMock、V1-V8 migration 与 108 项既有 Server
测试全部通过。三份上游锁匹配；Harness 位于 `dsh-v0.1.0-rc.7` 的
`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 且工作区干净。

## 品味自检

- 依赖方向保持 `bundle -> distribution -> platform-client/contracts`；本地 API 只接收回调，没有形成
  platform-client 与 distribution 的循环依赖。
- 两个 Cordis Service 都使用官方 shadow receiver 兼容的 TypeScript `private` 状态；真实 Context
  代理测试和 Harness 启动回归共同防止 ECMAScript `#private` 绕过单测后在 Loader 中失效。
- 状态机、制品验证、CLI、状态存储和外部 port 分文件，各自只有一个变更理由；最大业务文件 394 行，
  低于 800 行约束。
- 安装与回滚复用同一校验路径，安装与移除复用同一 subprocess 边界，没有第二套错误、日志或状态
  格式。没有为 T15 页面预埋空组件或 mock-only 接口。
- 新增和变更业务文件均有 L3 契约；package、scripts、docs、workspace 与根级 L2/L1 地图已经回环。

## 任务边界

T15 是唯一下一项：交付管理端上传/发布/分配/回滚/设备状态和桌面员工插件 tab，并以 Playwright 与
真实 Harness snapshot 验收。T15 独立完成并提交前不得开始 T16。
