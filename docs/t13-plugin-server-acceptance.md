# T13 插件服务端验收记录

状态：`completed`

验收日期：2026-08-19（Asia/Shanghai）

## 结论

T13 已完成，且没有进入 T14。Server 现在只接受符合冻结规则的预构建 pnpm bundle tgz，以整包
SHA-256 内容寻址，并对 RFC 8785 JCS 规范化签名声明执行 Ed25519 签名。版本、assignment、下载授权、
设备 inventory 和 bootstrap 插件投影形成同一 PostgreSQL/revision/审计纵向边界。

客户端安装、`ctx.subprocess`、本地状态文件、重启 active、回滚调和与插件 UI 仍未实现；这些分别属于
T14/T15。T13 没有修改同级 DeepSeek Harness。

## 核心实现

- Commons Compress 单遍读取不可信 tgz，不把 entry 解压到文件系统；拒绝路径逃逸、反斜杠/NUL、
  重复路径、链接、设备/FIFO、原生 `.node`、安装生命周期脚本、非空 dependencies、非精确 Harness
  peer、核心企业 bundle 与缺失 patch。
- 上传流先按 50 MiB 默认上限写入 `.part`，同步计算 SHA-256；验包还独立限制 200 MiB 展开字节和
  10,000 个 entry。CAS 以 `sha256/<前两位>/<hash>.tgz` 原子终结，不接受请求提供的路径。
- 同 hash 的 CAS 终结和事务补偿由 64 路进程锁加 artifact root 文件锁跨进程串行化，避免一个
  tenant 的失败补偿删除另一个并发事务已经复用的制品。
- 签名声明只含字符串 `artifactId/packageName/version`、十进制 `sizeBytes`、小写 `sha256` 与规范化
  `compatibility`；私钥只从 PKCS#8 文件加载，HTTP 投影只返回 64 字节签名的 Base64。
- 版本状态固定为 `UPLOADED -> VALIDATED -> PUBLISHED -> RETIRED`。相同 package/version 或 tenant
  内相同 SHA-256 由数据库自然键兜底并返回已有版本；六线程重复上传只产生一条事实。
- assignment 是 package revision CAS 下最多 200 条的原子全量替换，只能引用同 package 的
  PUBLISHED 版本。生效优先级固定为 USER、当前 DEPT、ALL，较高优先级 `ABSENT` 明确覆盖安装期望。
- 每次下载都重新验证 `dsh-desktop` ACTIVE 设备、当前用户和当前有效 assignment；未分配版本与
  `ABSENT` 均拒绝。assignment 已引用的退休版本仍可下载，支持完整或单一 bytes Range，并固定
  `Content-Length`、`Content-Range`、ETag、attachment、`Accept-Ranges` 和 `nosniff`。
- 设备 inventory 最多 500 条且 package 唯一，以当前设备为边界原子全量替换；替换与
  `PLUGIN_INVENTORY_REPORTED` 审计同事务。bootstrap 与独立 assignments API 复用同一生效解析器。

## 数据库与协议

Flyway `V8__enterprise_plugin_server.sql` 把 V2 历史 `ACTIVE/DISABLED` assignment 前向迁移为
`INSTALLED/ABSENT`，并冻结客户端下载、安装、重启、移除、失败与回滚库存状态。真实迁移测试覆盖
V1 到 V8 逐版本升级、V7 数据迁移和最终约束拒绝旧值。

OpenAPI 新增六个管理 operation 和三个 runtime operation；bootstrap 引用同一个
`RuntimePluginAssignments` schema。完整逻辑协议现有 63 个 operation、37 个正反 fixture、36 个稳定
错误码，SHA-256 为：

```text
bc8813622299d245a13189dad18421e410f61766be08c88b5f88e7bdc688f3d2
```

TypeScript contracts facade 同步公开 plugin DTO 与 strict Zod；三个新增 fixture 分别验证版本、有效
分配和 inventory 响应。Java MockMvc 使用相同派生 JSON Schema 验证九个 operation 的响应与错误。

## 自动验收

Server 全 reactor 门禁：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false test
```

结果：11 个 reactor 模块成功，108 项测试零失败。T13 的 14 项定向测试包含 7 项恶意归档/CAS/hash 锁、
2 项 JCS/Ed25519、1 项真实 PostgreSQL 纵向事务和 4 项 API 契约；全量回归同时覆盖 PostgreSQL 17、
Redis 8、OpenLDAP、WireMock、V1-V8 migration、身份、设备、模型、配额、网关、revision 与审计。

协议生成与独立门禁：

```sh
cd plugin
corepack pnpm@11.7.0 --filter @owndsh/contracts generate
corepack pnpm@11.7.0 --filter @owndsh/contracts check:generated
corepack pnpm@11.7.0 --filter @owndsh/contracts typecheck
corepack pnpm@11.7.0 --filter @owndsh/contracts test
```

结果：OpenAPI、自包含 JSON、JSON Schema、fixture manifest 与 TypeScript/Zod 无漂移，contracts 7 项
测试通过。

Harness 产品 workspace 全量回归：

```sh
cd plugin
corepack pnpm@11.7.0 run check
```

结果：6 个产品 package 的 typecheck/build 全部通过；contracts 7 项、session-sync 3 项、UI 7 项、
platform-client 18 项、llm-gateway 14 项、bundle 3 项和 workspace 4 项不变量全部通过。

## 安全与上游边界

```sh
node scripts/upstream-baseline.mjs verify
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

环境为 Git 2.39.5、Node.js 24.14.1、pnpm 11.7.0、Java 21.0.12 与 Docker client/server 28.5.2。
原始服务端框架、plus-ui 与 Harness 三份锁全部匹配。同级 `deepseek-harness` 精确位于标签
`dsh-v0.1.0-rc.7`、提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，工作区干净。

仓库新增内容不包含私钥、Token、API Key、client secret、artifact 字节或生产凭据。归档错误对外只映射
稳定类别，artifact 路径和签名私钥不进入响应；审计 metadata 只保存操作、revision、数量和 required。
新增业务 Java 文件均有 L3 契约，相关 L2/L1 地图已经同步，最大文件 364 行。

## 任务边界

T14 是唯一下一项：实现客户端下载、大小/SHA-256/Ed25519/compatibility 双重校验、固定
`ctx.subprocess` argv、原子状态文件、重启 active、清单和回滚。T14 独立验收并提交前不得开始 T15。
