# T17 Session 客户端验收记录

状态：`completed`

验收日期：2026-08-19（Asia/Shanghai）

## 结论

T17 已完成，且没有进入 T18。Harness 企业 bundle 现在通过官方 rc.7 `sessions` 与
`sessionPersistence` Service 装配 `EnterpriseSessionSyncService`：本地 `Session.append()` 和
`session/event` 不等待网络，逐 Session 单 worker 在防抖后执行 `flush -> readFrom -> batch upload`，
只有中心确认与请求完全一致时才原子提交本地游标。

READY 启动发现、断点续传、网络/认证/5xx 指数退避、协议终态、远端 cursor 列表和新 ID 恢复已形成同一
Host 纵向链路。恢复在创建本地 Session 前验证全部 export 页；任何 format、seq、payload hash、rolling
hash 或 header 不一致都不会留下半成品。T18 的管理 Session 页面和员工同步/恢复 tab 均未实现，也没有
修改同级 DeepSeek Harness。

## 核心实现

- `session/event` listener 只调用 `markDirty`；默认 2 秒防抖。每个 Session 至多一个 worker，worker 运行中
  到达的新事件只保留 dirty，当前读取完成后再次执行 flush/readFrom，不把中心可用性耦合到本地追加。
- Service 对 live Session 先调用官方 `ctx.sessions.flush()`，再从 `lastAckSeq + 1` 调用官方
  `ctx.sessionPersistence.readFrom()`。批次同时受 bootstrap `maxBatchBytes` 和本地事件数上限约束，使用与
  T16 完全同构的 format v0 header、精确 LF JSONL、payload SHA-256 和逐事件 rolling hash。
- `$DSH_HOME/enterprise/session-sync.json` 使用同目录 0600 临时文件和 rename 原子提交。严格 schema 只允许
  Session ID、源设备、确认 seq/hash、状态和时间；unknown field fail-closed，不保存 header、title、events、
  Token 或 Authorization。
- READY 时扫描 persistence 中的已存 Session，并从耐久确认点继续。网络、认证和 5xx 使用 1 秒起、60 秒
  封顶的指数退避；gap、diverge、source-device conflict、format unsupported 和 content expired 进入可见
  终态。状态通过本地 `/sessions/sync` 和复合 SSE 暴露，不写 model-visible Session Event。
- `GET /sessions` 透传中心 cursor 分页。`POST /sessions/{id}/copies` 先校验目标是现存目录，再逐页验证远端
  session ID、format、连续 seq、payload hash、rolling hash 和不变 header；全量通过后才通过官方
  `create(newId, { seed, meta })` 与 `flush()` 建立 `parentSession`/`seedLength` 副本，并记录 restore lineage。
- bundle 增加 `sessionPersistence` inject 和四个 Schemastery 参数；构建只内联产品包，官方 Cordis、LLM、
  Session、Persistence 与 Schemastery 继续由目标 Harness profile 提供单例。

## 自动验收

workspace 与定向单元门禁：

```sh
cd plugin
pnpm install --frozen-lockfile
pnpm check
```

`session-sync` 的 4 个测试文件、12 项测试覆盖精确字节/双边界切批、hash 篡改、0600 原子状态、非阻塞
append、逐 Session 单 worker、断点续传、退避终态、全页验证和新 ID 耐久恢复。`platform-client` 的 4 个
测试文件、19 项测试覆盖 exact/prefix 本地路由、远端分页/恢复 DTO、复合 SSE 与 disposer；bundle 的 3 项
测试覆盖 inject、rc.7 peer、external 边界和构建产物。

树外 package consumer：

```sh
cd plugin
pnpm run pack:session-sync
pnpm run smoke:session-sync
```

脚本把 contracts、platform-client 和 session-sync tgz 安装到全新目录，并从 npm 安装官方 rc.7
Session/Persistence peers，不使用 ambient shim 或同级 Harness 源码。真实 `SessionStore` 与 JSONL
persistence 输出：

```text
ambientShim: absent
officialPersistence: jsonl-rc.7
syncPipeline: flush-readFrom-ack
restoredSeed: durable-new-id
cursorFile: atomic-non-content
```

锁定 Harness 组合门禁：

```sh
cd plugin
pnpm run pack:bundle
pnpm run accept:t17-session
```

脚本把 bundle 安装到临时 `web` profile，以 gated 假中心配合真实 rc.7 JSONL backend，证明 append 在网络
gate 关闭时仍立即完成、随后执行真实 flush/readFrom、远端列表可用、恢复副本耐久且 lineage 正确。官方
Session 创建后会由基础设施监听器追加合法事件，因此断言远端事件是连续前缀、seedLength/parentSession
正确，最终 cursor 覆盖完整日志，而不把基础设施事件总数写死。输出：

```text
appendNetworkIsolation: gate-passed
flushReadFrom: real-jsonl
harnessCommit: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
remoteList: passed
restoredSeed: durable-new-id
```

## 上游与安全门禁

```sh
node scripts/upstream-baseline.mjs verify
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

同级 `deepseek-harness` 精确位于标签 `dsh-v0.1.0-rc.7`、提交
`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，组合验收前后工作区干净。cursor、发布包和验收输出不含
平台 Token、Authorization header、Session header/title/events 正文、模型密钥或真实用户数据。

## 品味自检

- dirty queue 只编排本地耐久事实，线协议只处理字节与 hash，cursor store 只处理无正文 metadata，恢复事务
  只在完整验证后触碰 SessionStore；四个变化理由没有塞进一个万能 Service。
- platform-client 通过 `EnterpriseLocalSessionPort` 反向消费 status/list/restore，不依赖 session-sync 具体包；
  bundle 是唯一组合根，没有引入 platform-client/session-sync 循环依赖。
- 远端确认是游标提交的唯一依据；错误确认和坏 export 页 fail-closed，不以“请求成功返回 JSON”替代协议一致性。
- 官方 Session/Persistence 是 peer 与运行时单例，产品 tarball 不复制 Harness 实现；真实 consumer 和组合测试
  分别证明发布包边界与宿主集成边界。
- 所有新增业务文件低于 800 行并具有 L3；session-sync/platform-client/bundle/scripts 的 L2 与项目 L1、
  详细设计、README 和本验收记录已经同步回环。

## 任务边界

T18 是唯一下一项：实现管理 Session 列表/正文/删除，以及桌面员工同步状态、远端列表和恢复 tab，并完成
正文权限 Playwright、读取审计、跨设备恢复 snapshot 与 GIF。T18 独立验收并提交前不得开始 T19。
