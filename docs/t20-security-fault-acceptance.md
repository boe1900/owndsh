<!--
[INPUT]: 依赖 T20 应用安全边界、故障恢复演练与后续 T21 当前部署职责。
[OUTPUT]: 记录请求限制、错误隔离、秘密扫描和数据恢复的验收事实。
[POS]: 应用安全纵向的历史验收证据；后续部署建议保持与现行 HTTP Compose 边界一致。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# T20 安全与故障验收记录

状态：`completed`

验收日期：2026-08-20（Asia/Shanghai）

## 结论

T20 已完成，且没有进入 T21。平台现在以默认拒绝跨域、强制外部 Sa-Token JWT secret、分层请求体上限、有界超时和 30 秒 graceful drain 作为应用基线。普通 enterprise JSON 在 MVC 解序列化前有界读取，Content-Length 和 chunked 共用 2 MiB 限制；模型网关、Session 明文批次和插件 multipart 保留各自的精确边界。

未知数据库、Redis 或磁盘故障统一投影为 retryable `ENT_PLATFORM_UNAVAILABLE` / 503，服务端只记录 requestId 和异常类型，不再记录可能携带凭据的 message 或 stack。新的 CI 扫描器检测 Bearer、JWT、API key、private key、credential 赋值和外置受控明文，命中时不回显秘密。

隔离 Docker 演练已证明 PostgreSQL 与 Redis kill/restart 不丢数据，且数据库 dump、Redis RDB、artifact archive 和独立 master/signing key archive 可恢复到全新目标。artifact 只读挂载的写入失败与 Java artifact store 启动/运行时 fail-closed 同时通过。

## 核心实现

- `application.yml` 开启 `server.shutdown=graceful` 和 30 秒 shutdown phase，将 Jetty form 限制为 1 MiB，multipart 单文件/总请求限制为 50/52 MiB，Session batch 修正为 1 MiB。
- `EnterpriseJsonBodyLimitFilter` 只预读普通 enterprise JSON，精确上限内用 cached request 交给 MVC，超限返回带 requestId 的 `ENT_REQUEST_TOO_LARGE` / 413。模型网关继续手动流式限制 10 MiB，multipart 由 Servlet 和 artifact store 双层限制。
- CORS 默认 `allowCredentials=false` 且 origin 列表为空。无 `Origin` 的同源请求正常通过，跨域请求默认 403，只有显式精确 origin 才会产生 CORS 许可头。
- `SA_TOKEN_JWT_SECRET_KEY` 无仓库 fallback，缺失时 Spring placeholder 解析失败，不能再用上游已知样例密钥签发平台 Token。
- `EnterpriseExceptionHandler` 和 `SaTokenExceptionHandler` 不记录异常 message/stack 或 raw Token；对外响应继续使用稳定安全文案。
- 配额不新增第二套限流系统。模型请求继续使用 T09 的真实 Redis Lua RPM/并发全成全败限流和 lease TTL；LOCAL 登录继续复用 captcha 与 原始服务端框架 用户失败锁定。
- provider 连接/读取、LDAP 连接/读取、Redis 连接/命令、Hikari 连接获取和 Harness 控制面请求继续使用已有有界超时，没有引入无界重试。

## 安全负例矩阵

| 规则 | T20 结果 |
|---|---|
| 同域 CORS | 默认跨域 403，同源放行，精确 origin 显式配置才授权 |
| PKCE/state/nonce/LDAP escape/redirect/code | T05/T04 独立负例在全量 enterprise 回归中通过 |
| 秘密日志 | 新扫描器自验、受控故障日志与 Sa-Token raw JWT 回归通过 |
| provider origin/redirect | 保留时固定 scheme/host/port，probe 与网关都禁止 redirect，相关 WireMock 回归通过 |
| 插件下载与签名 | attachment/nosniff、hash、Ed25519、恶意归档、越权下载和只读磁盘回归通过 |
| Session 正文 | 仅 export/content 授权方法解密，默认 1 MiB batch 与通用 JSON 传输上限同时通过 |
| 当前服务端事实 | 权限、owner、设备、grant 和 assignment 继续逐请求读取，无新缓存授权 |
| 备份恢复 | PostgreSQL dump、Redis RDB、artifact archive 和独立 key archive 恢复均通过 |

第 18.3 节中的生产 TLS、可信 forwarding header 清洗和 bootstrap admin 需要 Compose/Nginx/安装事务，由 T21 任务显式拥有。详细设计已澄清 T20 验收应用边界与无部署树演练，不把未实现的 T21 交付伪报为通过。

## 自动化验收

定向 Java 门禁：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-server -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=ResourcesConfigCorsTest,GracefulShutdownIntegrationTest,EnterpriseSafetyDefaultsTest,SaTokenSecretLoggingTest,EnterpriseSessionPropertiesTest,EnterpriseJsonBodyLimitFilterTest,T20FaultBoundaryTest,PluginArtifactSecurityTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

扫描器与恢复演练：

```sh
node --test scripts/scan-sensitive-logs.test.mjs
./scripts/t20-recovery-drill.sh
```

全量门禁：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-server -am -Dmaven.test.skip=false -DskipTests=false test

cd ../admin-web
corepack pnpm lint
corepack pnpm build:prod

cd ../plugin
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm pack:bundle
```

2026-08-20 最终实测结果：定向 Java reactor 通过且扫描 0 命中；完整后端 36 模块 reactor 在
4 分 10 秒内通过；管理端 lint/生产构建通过；Harness workspace 的 typecheck、测试、构建和 bundle
打包全部通过。全量执行还暴露并修复了 graceful drain 测试把 JVM root logger 设为 `OFF` 的测试间
污染，`owndsh-common-web` 随后按完整测试顺序 5 项通过。

## 故障与恢复证据

`scripts/t20-recovery-drill.sh` 使用带 PID 的专用容器名和 `mktemp` 隔离目录，trap 只清理本次创建的精确对象。演练顺序为：

1. 向 PostgreSQL 写入业务探针，向 Redis 写入两个 runtime 探针，创建 artifact 和两份随机 key。
2. 分别生成 PostgreSQL custom dump、Redis RDB、artifact tar 和 key tar，key 不进入 artifact 或数据库备份。
3. `docker kill` PostgreSQL/Redis，验证不可达，然后 `docker start` 并验证原事实仍在。
4. 启动全新 PostgreSQL/Redis 容器，从 dump/RDB 恢复并精确查询探针。
5. 恢复 artifact/key，比较 SHA-256 和字节；把 artifact 挂载为只读并证明写入失败。

最终输出：

```text
T20 恢复演练通过: PostgreSQL=1 Redis=2 artifact=1 keys=2 kill/restart=2 disk-fault=1
```

## 日志扫描复盘

首次对现存真实 Server 日志扫描发现 622 个历史 Bearer/JWT 形状命中。其中 SSE query `Authorization` 由 T19 前的旧访问日志产生，当前 `PlusWebInvokeTimeInterceptor` 已有大小写无关清洗回归；但 Sa-Token 全局异常处理仍把携带 raw JWT 的 `NotLoginException.message` 写日志。T20 因此新增 `SaTokenSecretLoggingTest` 并修改处理器，这个发现不被当作旧日志噪声忽略。

扫描器命中只输出文件、行号与 pattern 名，最多输出 50 条诊断，不回显 Token 或受控明文。修复后的全新定向测试日志作为 CI 输入重新扫描，常见秘密形状与受控 JWT 都为 0 命中。
旧日志均为 `.gitignore` 覆盖的本地运行产物；停止遗留的 T19 验收进程后，六个 `server/logs`
文件与 `/tmp/owndsh-t19-server.log` 已精确删除。最终全量执行没有重新生成 Server 日志，扫描
`server/target/t20` 与空的 `server/logs` 共读取 3 个新日志文件，结果仍为 0 命中。

## 上游与仓库边界

```sh
node scripts/upstream-baseline.mjs verify
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

三份产品上游锁保持匹配。同级 `deepseek-harness` 仍精确位于标签 `dsh-v0.1.0-rc.7`、提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 且工作区干净；T20 没有修改 Harness 文件。

## 品味自检

- 请求体限制按传输形态分层：普通 JSON 由公共 filter 管理，模型流、Session 明文和 multipart 保留业务精确限制，没有为一个特例把全局上限放大到 52 MiB。
- RPM/并发继续只有 Redis quota 一个事实源，没有再引入 IP 计数器、JVM 窗口或双写恢复问题。
- 扫描器是通用日志门禁，受控明文从独立文件注入，不把具体测试凭据硬编码到检查逻辑。
- 恢复演练只创建临时容器和目录，不依赖、修改或伪造 T21 的生产 Compose/备份脚本。
- 新增业务文件均小于 800 行并带 L3，common/api、common-web、session、admin test、scripts、docs 的 L2 与项目 L1/README/详细设计已回环。

## 改进建议

T21 应把本任务验证的数据集合收敛为生产 Compose 持久卷、正式备份/恢复入口和健康检查，同时完成 HTTP gateway forwarding header 规范化和一次性 bootstrap admin；需要 TLS 时由部署方外层网关终止。不要把 T20 的开发演练脚本直接宣称为生产备份方案。

## 任务边界

T21 是唯一下一项：交付 HTTP Compose/Nginx、初始化管理员、secret 生成、健康检查、正式备份/升级/回滚脚本与安装文档。T21 独立验收并提交前不得开始 T22。
