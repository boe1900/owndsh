# T16 Session 服务端验收记录

状态：`completed`

验收日期：2026-08-19（Asia/Shanghai）

## 结论

T16 已完成，且没有进入 T17。Server 现在接受官方 rc.7 `SESSION_FORMAT_VERSION=0` 的完整
`SessionHeader` 与精确 JSONL 事件批次，在 PostgreSQL 短事务和 replica 行锁内完成源设备绑定、连续性、
幂等、gap/diverge 判定、逐事件 rolling hash、AES-GCM 持久化和审计。

员工本人 list/export/delete、restore-record 审计入口，以及管理 metadata/content/delete 已形成同一纵向
边界。管理 metadata 不解密正文，content 独立要求 `ent:session:content:read` 并写
`SESSION_CONTENT_READ`。删除和 90 天 retention 都清除正文、保留 tombstone 并阻止后台重传。

T17 的 dirty queue、`session/event` 监听、`ctx.sessions.flush()`、`readFrom()`、本地游标文件、重试状态机
和本地新 ID 恢复副本均未实现，也没有修改同级 DeepSeek Harness。

## 核心实现

- `payloadBase64` 解码后必须是以 LF 结束、无空行/CRLF 的 UTF-8 JSONL；32 字节 hash 必须使用带 `=` 的
  44 字符 canonical Base64。payload SHA-256 对包含换行的完整字节计算；`H[-1]` 为 32 个零字节，
  `H[n]=SHA-256(H[n-1] || rawLineWithoutNewline)`。
  Server 解析 envelope 只验证非空 type、连续非负安全整数 seq/time 与存在的 JSON data，未知事件类型保留。
- 首批必须从 seq 0 开始并携带锁定 rc.7 的完整已知 header 字段；后续批次禁止再次携带 header。V9 不修改
  已发布 V3，而是前向把错误的 `format_version > 0` 历史约束修正为精确 `format_version = 0`。
- `(tenant, owner, sessionId)` 唯一事实绑定首次 ACTIVE source device。replica `FOR UPDATE` 串行化 hash 与
  append；`(tenant,idempotencyKey)`、`(replica,seq)` 唯一键兜底并发。完整 key/range/payload 重复返回原确认，
  gap、分叉和跨设备写入分别返回冻结错误码。
- header、title 与每条 raw event line 分别使用 `SESSION_CONTENT` AES-256-GCM 加密；AAD 绑定 tenant、表、
  replica/event ID、字段和 key version。`event_hash` 保存逐事件 rolling-hash checkpoint，使任意导出页都能
  返回独立的 previous/final hash 证明，而不扫描或重序列化历史事件。
- 员工列表只解密本人标题；导出在行锁内读取 header/title 与最多 200 个 raw event，返回精确 payload、
  payload SHA-256 和前后 rolling hash，并写 `SESSION_EXPORTED`。restore-record 只在 Host 成功后记录源/新 ID
  关联审计，不假装执行 T17 的本地恢复。
- 管理列表只投影 owner、source device、format、计数、时间和状态。正文入口使用独立权限并写
  `SESSION_CONTENT_READ`；管理删除使用 `ent:session:delete`。审计 metadata 仅含范围、数量、状态和恢复 ID，
  不允许 header、title 或 event line 进入 JSONB。
- 删除清空 header/title/event 密文并保留 `DELETED`；每日 retention 分批锁定 90 天未更新 ACTIVE 副本，
  清空正文并保留 `EXPIRED`。两种 tombstone 的 last seq、event count、rolling hash、owner 和 source device
  均保留，任何重复后台上传稳定返回正文已删除/过期。

## 数据库与协议

Flyway `V9__enterprise_session_format.sql` 修正官方格式版本，约束 event/batch/rolling hash 长度，并增加
`(status,updated_at,id)` retention 索引。真实 migration 测试同时覆盖空 schema、V1 至 V9 逐版本升级、
format v0 写入和非 v0 拒绝。

OpenAPI 新增五个 runtime 和三个 admin operation，共 71 个 operation；五个 Session 成功 fixture 分别覆盖
批次确认、本人列表、精确导出、管理 metadata 和删除 tombstone。TypeScript facade 同步公开 Session DTO 与
strict Zod。完整逻辑协议 SHA-256 为：

```text
573ed0f3ef82a912fbaf9f25914e0bbb7b152d40618add0ef2540a1e641817a0
```

## 自动验收

Server 全 reactor 门禁：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false test
```

T16 定向门禁包含 2 项精确字节 parser、1 项真实 PostgreSQL 纵向矩阵、3 项 Session HTTP/权限契约和
3 项 V1-V9 migration 测试。真实数据库矩阵覆盖连续批次、完整重复、gap、diverge、错误 previous hash、
跨设备冲突、六线程并发幂等、六线程竞争 append、本人隔离、分页 hash 链、管理正文读取、密文、恢复审计、
删除、过期与敏感审计扫描。

协议生成与 TypeScript 门禁：

```sh
cd plugin
corepack pnpm@11.7.0 --filter @owndsh/contracts generate
corepack pnpm@11.7.0 --filter @owndsh/contracts check:generated
corepack pnpm@11.7.0 --filter @owndsh/contracts typecheck
corepack pnpm@11.7.0 --filter @owndsh/contracts test
corepack pnpm@11.7.0 run check
```

contracts 的 8 项测试通过；Session v0、严格未知字段和五个新增 fixture 同时由 Zod 与 Java JSON Schema
消费。生成的 OpenAPI JSON、JSON Schema、fixture manifest、TypeScript/Zod 与协议 hash 无漂移。

上游与仓库门禁：

```sh
node scripts/upstream-baseline.mjs verify
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

同级 `deepseek-harness` 精确位于标签 `dsh-v0.1.0-rc.7`、提交
`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，工作区干净。产品提交不包含 Harness 源码、Token、
master key、模型密钥或真实 Session 数据。

## 品味自检

- parser 只负责不可信字节与格式，application 只负责编排，JDBC adapter 只负责持久化；密码学 AAD 与审计
  metadata 都是显式类型，没有把 Controller request、任意 Map 或明文交给基础设施。
- 并发事实由数据库行锁和唯一键表达，没有引入进程内 session mutex；多实例部署保持同一语义。
- 管理 metadata 与正文是两个接口、两个权限、两个投影，避免“有列表权限就顺便解密”的隐式越权。
- 删除不物理移除 replica，不允许后台同步把管理员刚删除的内容重新创建；retention 复用同一 tombstone 原语。
- 所有新增业务文件低于 800 行并具有 L3；session/domain/application/persistence/web 的 L2 与项目 L1、详细
  设计、README、协议和验收文档已经同步回环。

## 任务边界

T17 是唯一下一项：实现 dirty queue、flush/readFrom、原子游标、网络退避/终态、远端列表和新 Session ID
seed 恢复。T17 独立验收并提交前不得开始 T18；T16 没有监听本地事件、写游标文件或创建本地恢复副本。
