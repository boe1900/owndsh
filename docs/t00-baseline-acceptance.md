# T00 基线验收记录

状态：`completed`（rc.7 重新基线已通过）

验收日期：2026-08-17；2026-08-19 重新基线（Asia/Shanghai）

## 实际修改路径

- `server/`：从 原始服务端框架-Vue-Plus `v6.0.0` 的提交 `7180b529776834fee912113b23f0bd7a387a8222` 导入，不含上游 `.git`；产品导入工具补齐 `mvnw` Unix 执行位。
- `admin-web/`：从 plus-ui `6.X-React` 的提交 `29fc02f0a6d5a2462872487524a11c64e956534b` 导入，不含上游 `.git`；按机器锁补入上游历史 MIT `LICENSE`。
- `plugin/`：建立与锁定 Harness 相同 Node/pnpm 约束的独立空 workspace；T01 才创建首批技术刺探包。
- `scripts/upstream-baseline.mjs`：校验三个版本锁、验证远端引用、原子导入两个产品源码快照并检查同级 Harness。
- `scripts/upstream-baseline.test.mjs`、`plugin/workspace.test.mjs`：覆盖锁格式、Git 引用解析、来源归一化和 workspace 边界。
- `CLAUDE.md` 与三个新模块的 `CLAUDE.md`：同步 T00 后的 L1/L2 地图；新增 JavaScript 文件均带 L3 契约。

## 环境证据

| 工具 | 实际版本与状态 |
|---|---|
| Git | `2.39.5 (Apple Git-154)` |
| Node.js | `v24.14.1`，满足 Harness `^22.19.0 || >=24.0.0` |
| pnpm | 系统 `11.19.0`；Corepack 分别使用 Harness/插件 `11.7.0` 与 admin-web `10.34.5` |
| Java | Homebrew OpenJDK `21.0.12`，路径 `/usr/local/opt/openjdk@21`；系统 shim 未注册，构建显式设置 `JAVA_HOME` |
| Docker | Client/Server `28.5.2`，daemon 可用 |

## 实际运行命令与结果

| 命令 | 结果 |
|---|---|
| `./scripts/bootstrap-harness.sh` | 成功；同级 checkout 为 `47f943859bef60e4160492346772ded9b24f765a`、版本 `0.1.0-rc.5` |
| `node --test scripts/upstream-baseline.test.mjs` | 7/7 通过 |
| `node scripts/upstream-baseline.mjs verify` | 三个锁通过；两个产品来源 ref 与提交一致；Harness origin、版本、提交和清洁度一致 |
| `JAVA_HOME=/usr/local/opt/openjdk@21 sh mvnw -B -ntp -DskipTests package`（`server/`） | 40/40 Maven reactor 模块成功 |
| `JAVA_HOME=/usr/local/opt/openjdk@21 sh mvnw -B -ntp -Dmaven.test.skip=false test`（`server/`） | 40/40 模块成功；上游现有测试 1/1 通过 |
| `corepack pnpm install --frozen-lockfile && corepack pnpm build`（`admin-web/`） | 锁定依赖安装成功；7180 个模块生产构建成功 |
| `corepack pnpm lint`（`admin-web/`） | Oxlint、Umi setup 与 TypeScript no-emit 检查成功 |
| `corepack pnpm install --frozen-lockfile && corepack pnpm check`（`plugin/`） | workspace 安装成功；2/2 不变量测试、typecheck/build 门禁成功 |
| `corepack pnpm install --frozen-lockfile && corepack pnpm build`（同级 `deepseek-harness/`） | 供应链锁检查、Host/Client 库与 Web 原始构建成功 |
| `./scripts/bootstrap-harness.sh --check-only` | 成功；构建后 Harness 仍位于锁定提交且 `git status --porcelain` 为空 |
| `git diff --cached --check -- . ':(exclude)server/**' ':(exclude)admin-web/**'`，再检查三个产品补充文件 | 成功；产品自有变更无 whitespace 错误 |

完整 staged diff 会报告 原始服务端框架 锁定快照原有的尾随空格和文件尾空行。T00 保留上游源码内容，不为通过样式检查而批量改写第三方基线；后续产品代码仍执行严格 whitespace 门禁。

## 退出结论

T00 的三个上游提交均可由机器锁和导入/bootstrap 工具重现；产品 Git 不包含 Harness 源码或嵌套 Git 元数据；backend、admin-web、插件 workspace 与未修改的锁定 Harness 原始构建全部通过。T01 可以在独立后续任务开始；本次提交未包含任何 T01 技术刺探实现。

## 2026-08-19 rc.7 重新基线

### 升级决策

- npm 已无法完整获取 rc.5 依赖闭包，而 `dsh-v0.1.0-rc.7` 是官方当前发布 tag。
- Harness 整套锁定到 `0.1.0-rc.7` / `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，不依赖 pnpm 为 bundle peer 隐式选择新 rc，也不允许 Host 与 bundle 混版。
- rc.7 的官方插件、`dsh.client`、`ctx.webServer`、UI slot 和 `LlmAdapter` 公开路线继续作为产品边界；未向同级 Harness 添加任何 patch。

### 环境与验收证据

| 项目 | 结果 |
|---|---|
| 环境 | Git `2.39.5`；Node.js `v24.14.1`；pnpm `11.19.0`；Harness Corepack pnpm `11.7.0`；Java `21.0.12`；Docker Client/Server `28.5.2` |
| `./scripts/bootstrap-harness.sh` | 检出官方 tag `dsh-v0.1.0-rc.7` 的完整 commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` |
| `node --test scripts/upstream-baseline.test.mjs` | 7/7 通过 |
| `node scripts/upstream-baseline.mjs verify` | 三个上游锁、Harness origin/版本/提交/清洁度全部一致 |
| `pnpm install --frozen-lockfile && pnpm build`（同级 Harness） | 完整 Host、Client 与 Web 生产构建通过 |
| `JAVA_HOME=/usr/local/opt/openjdk@21 ./mvnw -B -ntp -DskipTests package`（`server/`） | 41/41 Maven reactor 模块成功 |
| `JAVA_HOME=/usr/local/opt/openjdk@21 ./mvnw -B -ntp -Dmaven.test.skip=false test`（`server/`） | 41/41 模块成功；`owndsh-enterprise` 92 项与 `owndsh-server` 5 项测试零失败 |
| `pnpm install --frozen-lockfile && pnpm lint && pnpm build`（`admin-web/`） | lint/typecheck 与 7180 模块生产构建通过 |
| `pnpm install --frozen-lockfile && pnpm check`（`plugin/`） | 全 workspace typecheck、build、单测和 4/4 边界检查通过 |
| `pnpm run pack:platform-client && pnpm run smoke:platform-client` | 无 ambient shim 的真实 tarball consumer、built-lib import 和非秘密 installation 通过 |
| `pnpm run pack:bundle && node scripts/t01-harness-smoke.mjs` | 企业 bundle 在未修改 rc.7 Harness `web` profile 中通过 package consumer、Client bundle、本地 API/SSE 和 Session seed 验收 |
| `./scripts/bootstrap-harness.sh --check-only` | 同级 Harness 仍位于锁定 commit，`git status --porcelain` 为空 |

完整回归首次运行发现 `EnterpriseContractSchemaTest` 仍硬编码 T05 时的 16 项 fixture 计数，而 T08-T10 已将生成 manifest 扩展到 33 项。门禁已改为要求 manifest 非空并遍历验证其全部声明，不再让协议扩展与手工计数耦合；L3/L2 契约已同步，修正后完整 Maven 回归通过。

### 退出结论

rc.7 上游锁、产品报告版本、当前设计链接与真实组合环境已同步；不依赖 ambient shim，不包含 Harness 源码修改。T01-T10 的历史验收事实保留，T11 可以在 rc.7 基线上继续。
