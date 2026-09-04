# T18 Session 页面验收记录

状态：`completed`

验收日期：2026-08-19（Asia/Shanghai）

## 结论

T18 已完成，且没有进入 T19。管理端现在通过动态菜单提供 Session metadata cursor 列表、独立权限正文时间线和 ACTIVE 二次确认删除；员工桌面端在官方 Enterprise Settings 中增加 Session 同步 tab，展示无正文游标、远端副本、跨设备恢复和删除状态。

真实 PostgreSQL/Server/Playwright 已证明管理员、审计员和普通员工的三组权限面，并确认正文读取只写一条无正文 `SESSION_CONTENT_READ` 审计。未修改的 DeepSeek Harness `dsh-v0.1.0-rc.7` 完成了远端日志恢复、新 ID 本地耐久化、自动回传、删除 tombstone 和同 profile 重启；重启后该本地副本的新增上传次数为 `0`。

## 核心实现

- 管理 Session API 边界保留 cursor metadata，正文单独按页读取。浏览器只解码 canonical Base64 与精确 LF JSONL，校验 seq/range 后投影为最小时间线；header、rolling hash 和传输正文不进入持久状态。
- 菜单列表依赖 `ent:session:list`，正文 Drawer 依赖 `ent:session:content:read`，删除依赖 `ent:session:delete`。页面和 Server 都裁决权限：隐藏按钮不被当作 API 授权，employee 直接请求管理端点稳定返回 403。
- 正文 Drawer 保留未知事件类型，已知 user/tool 事件提供稳定标签；任意事件 JSON 只在用户展开当前项时呈现。删除只对 ACTIVE 显示，成功后刷新为 DELETED 且不再提供删除入口。
- Host 本地 API 增加 Session sync/list/restore/delete 与复合 SSE；platform-client 只依赖最小 `EnterpriseLocalSessionPort`，bundle 继续是唯一组合根，没有反向依赖 session-sync 具体实现。
- 员工 tab 显示十一种游标状态、待同步数、最后成功时间、远端 cursor 和源设备。恢复必须给出现存目录，成功显示新 Session ID；删除需内联二次确认。
- 删除服务先暂停并等待目标 worker，再请求中心 tombstone。匹配响应以原子方式提交 `DELETED` 游标；即使删除发生在首次防抖上传前，也会以 `lastAckSeq=-1` 和初始 hash 耐久记录终态。启动发现与新 dirty event 都跳过该终态，删除失败则恢复原 worker 事实。

## 权限与审计验收

| 身份 | 列表 | 正文 | 删除 | Server 越权结果 |
|---|---|---|---|---|
| `admin` | 可见 | 可见 | ACTIVE 可二次确认删除 | 允许 |
| `auditor` | 可见 | 可见 | 无入口 | 删除 403 |
| `employee` | 无菜单 | 无入口 | 无入口 | 管理 API 403 |

真实 E2E 以 desktop Session batch 写入两条事件，再以三组独立管理会话完成上表。管理员读取正文后，PostgreSQL 集成断言 `SESSION_CONTENT_READ = 1`，且该审计 metadata 无 title、event body 或其他 Session 正文。

```sh
cd admin-web
ENT_E2E_BASE_URL=https://127.0.0.1 \
node_modules/.bin/playwright test e2e/session-pages.spec.ts --reporter=list
```

结果：`1 passed (22.9s)`。

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=SessionServerIntegrationTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

结果：`Tests run: 1, Failures: 0, Errors: 0, Skipped: 0`。

## Harness 真实浏览器验收

```sh
cd plugin
pnpm run pack:bundle
pnpm run accept:t18-browser
```

载体安装当前 bundle tgz 到临时 rc.7 `web` profile，通过受控假平台提供来自“办公室工作站”的 4 事件远端 Session。浏览器从官方 Settings 进入“企业 -> 会话同步”，恢复到新 ID，等待新本地副本上传并达到“已同步”，随后二次确认删除。载体停止并重启同一 profile，输出：

```text
deletedCursor: persisted
harnessCommit: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
restoredSourceDevice: 90017
restartRetransmit: 0
```

第一次真实恢复还发现验收载体的假 message event 不满足 rc.7 Session seed 不变量；这不是 Harness 故障。载体已改用完整 `turn/start -> user/message -> assistant/message -> turn/end` 序列，且 `restore.spec.ts` 成功路径现直接调用真实 `Session.create()` 校验器，防止宽松测试桩再次遮蔽官方运行时契约。

验收媒体：

- [`assets/t18-01-admin-session-content.png`](assets/t18-01-admin-session-content.png)
- [`assets/t18-02-auditor-session-content.png`](assets/t18-02-auditor-session-content.png)
- [`assets/t18-03-session-deleted.png`](assets/t18-03-session-deleted.png)
- [`assets/t18-04-harness-session-restored.png`](assets/t18-04-harness-session-restored.png)
- [`assets/t18-05-harness-session-deleted.png`](assets/t18-05-harness-session-deleted.png)
- [`assets/t18-session-pages.gif`](assets/t18-session-pages.gif)

GIF 为 `1280x720`、10 秒，覆盖登录、远端列表、恢复成功、删除确认和删除完成；媒体不含 Token、Authorization、模型 Key 或真实用户数据。

## 全量门禁

管理端：

```sh
cd admin-web
pnpm test
pnpm lint
pnpm build:prod
```

Vitest 的 8 个文件、20 项全部通过；Oxlint、OpenAPI 生成、Umi setup 与 TypeScript 无错误；生产构建成功转换 7252 个模块。

Harness workspace 与制品：

```sh
cd plugin
pnpm check
pnpm --filter @owndsh/contracts generate
pnpm --filter @owndsh/contracts check:generated
pnpm run pack:bundle
node scripts/t01-harness-smoke.mjs
```

7 个正式 package 的 typecheck/build 通过；contracts 8 项、UI 12 项、platform-client 19 项、llm-gateway 14 项、plugin-distribution 11 项、session-sync 15 项、bundle 3 项与 workspace 4 项不变量全部通过。OpenAPI 生成无漂移。新 bundle 被全新树外 consumer 和真实 Harness profile 成功消费，`packageConsumer`/`statusApi`/`pluginStatusApi`/`localEvents`/`sessionSeed` 均为 `passed`。

## 上游与边界

```sh
node scripts/upstream-baseline.mjs verify
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

三份上游锁均匹配。同级 `deepseek-harness` 精确位于标签 `dsh-v0.1.0-rc.7`、提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，所有组合验收前后工作区干净。T18 没有修改 Harness 文件，没有把 Session 正文、Token、Authorization 或模型密钥写入游标、审计 metadata、页面持久状态或验收媒体。

## 品味自检

- 管理 metadata、正文和删除是三个独立权限/请求边界，没有为页面方便合并成“列表即解密”的万能端点。
- 浏览器 API 只对固定同源路径编码，严格解码后立即投影；React 不接触 Host Context、平台 Token、hash 或原始 export envelope。
- 恢复与删除是 session-sync 的业务事实，platform-client 只承载反转端口，UI store 只组织用户交互；依赖方向未形成循环。
- `DELETED` 是耐久终态，而不是“当前页面把行隐藏”；真实重启断言了跨进程语义。
- 所有新业务文件均小于 800 行并带 L3；admin-web、platform-client、session-sync、UI、scripts、docs/assets 的 L2 与项目 L1、README、详细设计和本记录已回环。

## 任务边界

T19 是唯一下一项：按详细设计第 13 节补齐全部审计 action、管理查询页、metadata 白名单和 retention，并演示 requestId 可关联。T19 独立验收并提交前不得开始 T20。
