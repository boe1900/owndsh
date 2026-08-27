# DSH Desktop 2.0.3 / Harness rc.2 基线迁移

状态：`completed`（2026-08-27）

## 冻结基线

| 组件 | 版本 | commit |
|---|---|---|
| DSH Desktop | `2.0.3` | `1eb398d78108de1303ce29b1aeaf70aaf96acee4` |
| DeepSeek Harness | `0.1.1-rc.2` | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |

`upstream/dsh-desktop.lock.json` 是发行基线真源；`upstream/deepseek-harness.lock.json` 必须与 Desktop 的 Harness gitlink 完全一致。同级 `dsh-desktop/`、其 submodule 和同级 `deepseek-harness/` 均保持上游 checkout，不接受产品 patch。

## 上游变化与插件影响

| 上游变化 | 企业插件结论 |
|---|---|
| Desktop 公开 generation-scoped `desktopProfiles.current` | Desktop 中必须使用实际当前 profile，不能猜测 `web` 或另造 `desktop` 配置值。 |
| Desktop 公开 `desktopPnpm.runPlugin()` | 受管插件安装/移除委托 Desktop 自带 DSH CLI；普通 Web 保留 `ctx.subprocess` 路径。 |
| Electron renderer 继续组合 Web Client module | bundle 的 `dsh.client.platform` 必须保持 `web`；改为 `desktop` 会让 Client module 不被加载。 |
| `dsh-llm` 每次请求通过 `prepareCall()` 捕获 adapter/profile 快照 | 动态 bootstrap 更新可以继续替换官方 pi-ai profile，进行中的请求保持原路由语义。企业层无需适配器。 |
| `dsh-llm-pi-ai` 扩展动态鉴权、登录、模型目录、compat 与图片请求预算 | 企业层继续只投影三协议模型事实并提供认证代理，不复制这些协议能力。 |
| 默认 provider 重试从 2 次增加到 5 次 | 企业 profile 不覆盖 `retryPolicy`，忠实继承官方默认。连续瞬时失败会增加最长等待和重复请求成本；pi-ai SDK 自身仍固定零重试，避免重试倍增。 |
| Session 增加 team event 类型与 `assistant/message.interrupted` | 当前 format v0 精确 JSONL 复制保持透传；Session/Persistence 公开调用未断裂。 |
| subprocess 与 plugin inventory 仅版本/文档变化 | 普通 Web 调和路径无需行为适配；peer 精确升级到 rc.2。 |

## 企业改动

- bundle、LLM、Session、subprocess、inventory peer 全部精确升级到 `0.1.1-rc.2`。
- Desktop 环境读取 `desktopProfiles.current.name`，并以 `desktopPnpm.runPlugin()` 作为受管插件命令口；普通 Web 继续执行官方 `dsh plugin` CLI。
- 新增 Desktop→Harness 派生锁校验与 `scripts/bootstrap-desktop.mjs`，拒绝错误 origin、脏 checkout、版本或 gitlink 漂移。
- T11 验收入口先重打当前 bundle tgz，避免同名 rc.7 缓存制品造成假失败。

## 验证证据

| 门禁 | 结果 |
|---|---|
| `node --test scripts/upstream-baseline.test.mjs` | `8/8` 通过，覆盖 Desktop/Harness 锁对齐。 |
| `node --test harness-plugin/workspace.test.mjs` | `4/4` 通过，两个 Harness checkout 与 Desktop commit 精确匹配机器锁。 |
| `pnpm typecheck` | 全 workspace 通过，rc.2 公开 Host API 无类型断裂。 |
| `pnpm --filter @enterprise-agent/dsh-plugin-distribution test` | `12/12` 通过，含 Desktop command port 与普通 Web subprocess。 |
| `pnpm smoke:plugin-distribution` | 树外 consumer 通过，无 ambient shim，JCS 与无秘密原子状态成立。 |
| `pnpm smoke:session-sync` | 树外 consumer 通过，官方 `jsonl-rc.2` 完成 flush/readFrom/ack 与新 ID 恢复。 |
| DSH Desktop `yarn typecheck` / `yarn build` | 均通过，官方 Desktop Host/Client 完整构建成立。 |
| DSH Desktop `verify:profile` | 通过，完整 profile Loader 提供 `desktopProfiles` 与 `desktopPnpm`。 |
| `pnpm accept:t11-model` | 通过真实 rc.2 Web Host：三协议、动态目录、`enterprise/default`、`xhigh`、503→`llm/retry`→成功、错误矩阵及无本地上游 Key。 |

## 结论

升级对企业插件有影响，但边界集中且已收口：版本 peer、Desktop profile 识别和插件命令委托。模型协议、重试执行、Session、Electron 生命周期仍由上游拥有；企业插件继续同时支持 Desktop 与普通 Web，不增加第二套 AI 或桌面抽象。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
