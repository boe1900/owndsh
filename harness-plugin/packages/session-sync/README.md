# @enterprise-agent/dsh-session-sync

Harness Host 的本地优先 Session 复制边界。`EnterpriseSessionSyncService` 依赖官方 rc.7
`sessions`、`sessionPersistence` 和产品 `enterprisePlatform` Service，并注册
`ctx.enterpriseSessionSync`。`session/event` 回调只标记 dirty；默认防抖 2 秒后，每个 Session
由唯一 worker 执行 `flush -> readFrom(lastAckSeq + 1) -> batch upload -> cursor commit`，因此本地
append 和 persistence 写入路径不等待网络。

批次同时受平台 bootstrap 的 `sessionPolicy.maxBatchBytes` 和本地 `maxBatchEvents` 限制。线协议使用
官方 format v0 完整 header、`JSON.stringify(event) + "\n"` 精确字节、payload SHA-256 与逐行
rolling hash。只有中心返回的 `acceptedThroughSeq` 和 rolling hash 与请求完全一致后，才把确认游标
原子提交到 `$DSH_HOME/enterprise/session-sync.json`。该 0600 文件只保存 Session ID、源设备、确认
序号、hash、状态和时间，不保存 header、title、event、Token 或认证 header。

READY 时 Service 发现官方 persistence 中已有的 Session，并从耐久确认游标断点续传。网络、认证和
5xx 进入有上限的指数退避；`SEQ_GAP`、`DIVERGED`、`SOURCE_DEVICE_CONFLICT`、
`FORMAT_UNSUPPORTED`、`CONTENT_EXPIRED` 进入人工可见终态，避免无限重传或静默分叉。`dispose()`
停止新任务、中止在途请求，并最多等待配置的关闭上限。

恢复先分页下载并验证每一页的 session ID、format、seq、payload hash、rolling hash 和稳定 header；
任何页失败都不会创建本地 Session。全部验证后，Service 通过官方
`ctx.sessions.create(newId, { seed, meta })` 创建带 `parentSession`/`seedLength` 的新 ID 副本，
`flush()` 成功后向中心记录 restore lineage，再把新副本加入正常同步队列。远端原记录不会被覆盖。

删除远端 Session 前，Service 先暂停该 Session 的 timer/worker 并等待在途工作停稳，避免删除与上传竞态。中心返回匹配 ID 的 tombstone 后，本地原子游标提交为 `DELETED`；即使删除赢得首次防抖上传，也会以初始 hash 建立终态。启动发现和后续 dirty event 都跳过该终态，因此原本仍存在的本地副本不会在重启后自动重传。删除请求失败时恢复之前的 dirty/paused 事实，不伪造 tombstone。

发布包的主要配置为 `debounceMs=2000`、`retryInitialMs=1000`、`retryMaxMs=60000`、
`disposeTimeoutMs=3000` 和 `maxBatchEvents=200`；单个批次的字节上限始终由已认证 bootstrap 策略决定。
