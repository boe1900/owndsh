# T00 基线验收记录

状态：`completed`

验收日期：2026-08-17（Asia/Shanghai）

## 实际修改路径

- `backend/`：从 RuoYi-Vue-Plus `v6.0.0` 的提交 `7180b529776834fee912113b23f0bd7a387a8222` 导入，不含上游 `.git`；产品导入工具补齐 `mvnw` Unix 执行位。
- `admin-web/`：从 plus-ui `6.X-React` 的提交 `29fc02f0a6d5a2462872487524a11c64e956534b` 导入，不含上游 `.git`；按机器锁补入上游历史 MIT `LICENSE`。
- `harness-plugin/`：建立与锁定 Harness 相同 Node/pnpm 约束的独立空 workspace；T01 才创建首批技术刺探包。
- `scripts/upstream-baseline.mjs`：校验三个版本锁、验证远端引用、原子导入两个产品源码快照并检查同级 Harness。
- `scripts/upstream-baseline.test.mjs`、`harness-plugin/workspace.test.mjs`：覆盖锁格式、Git 引用解析、来源归一化和 workspace 边界。
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
| `JAVA_HOME=/usr/local/opt/openjdk@21 sh mvnw -B -ntp -DskipTests package`（`backend/`） | 40/40 Maven reactor 模块成功 |
| `JAVA_HOME=/usr/local/opt/openjdk@21 sh mvnw -B -ntp -Dmaven.test.skip=false test`（`backend/`） | 40/40 模块成功；上游现有测试 1/1 通过 |
| `corepack pnpm install --frozen-lockfile && corepack pnpm build`（`admin-web/`） | 锁定依赖安装成功；7180 个模块生产构建成功 |
| `corepack pnpm lint`（`admin-web/`） | Oxlint、Umi setup 与 TypeScript no-emit 检查成功 |
| `corepack pnpm install --frozen-lockfile && corepack pnpm check`（`harness-plugin/`） | workspace 安装成功；2/2 不变量测试、typecheck/build 门禁成功 |
| `corepack pnpm install --frozen-lockfile && corepack pnpm build`（同级 `deepseek-harness/`） | 供应链锁检查、Host/Client 库与 Web 原始构建成功 |
| `./scripts/bootstrap-harness.sh --check-only` | 成功；构建后 Harness 仍位于锁定提交且 `git status --porcelain` 为空 |
| `git diff --cached --check -- . ':(exclude)backend/**' ':(exclude)admin-web/**'`，再检查三个产品补充文件 | 成功；产品自有变更无 whitespace 错误 |

完整 staged diff 会报告 RuoYi 锁定快照原有的尾随空格和文件尾空行。T00 保留上游源码内容，不为通过样式检查而批量改写第三方基线；后续产品代码仍执行严格 whitespace 门禁。

## 退出结论

T00 的三个上游提交均可由机器锁和导入/bootstrap 工具重现；产品 Git 不包含 Harness 源码或嵌套 Git 元数据；backend、admin-web、插件 workspace 与未修改的锁定 Harness 原始构建全部通过。T01 可以在独立后续任务开始；本次提交未包含任何 T01 技术刺探实现。
