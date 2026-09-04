# T19 审计闭环验收记录

状态：`completed`

验收日期：2026-08-20（Asia/Shanghai）

## 结论

T19 已完成，且没有进入 T20。第 13 节冻结的 30 个 action 现在都由唯一、不可变的 metadata DTO 在编译期声明；`AuditEvent` 拒绝 action 与 DTO 错配，JDBC sink 只序列化显式字段，不接受 Controller request map。

管理端提供 `ent:audit:read` 保护的 tenant 隔离、九维筛选和认证 cursor 分页，响应主动裁掉来源 IP 与 user-agent hash。管理员和审计员可只读查询，普通员工无菜单且 API 返回 403。真实模型流证明 `MODEL_REQUEST_ACCEPTED` 与 `MODEL_REQUEST_FINISHED` 共享 requestId，页面可关联两条记录，metadata 不含 credential、prompt、message、工具参数或异常 stack。

审计保留任务默认每天按 tenant 分批删除 365 天前记录，不暴露历史更新或普通删除入口。用户角色和状态变更经 system 模块的脱敏领域事件在 `BEFORE_COMMIT` 写审计，任一侧失败时整笔事务回滚。设备 heartbeat 在数据库行锁内原子限频：首次、满一小时或 pending/sync 异常状态切换时记录，其余成功心跳不淹没账本。

## 核心实现

- `AuditMetadata` 为每个 DTO 声明唯一 action，`AuditMetadataPolicyTest` 枚举全部 30 个冻结 action；action 声明本身不进入 JSONB，错配在构造 `AuditEvent` 时失败。
- `GET /enterprise/admin/v1/audit-events` 支持 actor、action、resource、result、reason、requestId 和半开时间区间筛选。cursor AAD 绑定 tenant 与完整筛选条件，不能跨筛选重放。
- PostgreSQL 查询按 tenant 与单调 ID keyset 分页；retention 按 `(tenant_id, occurred_at, id)` 有界删除。`V10` 只补索引，不削弱 V4 的 update 拒绝触发器。
- `SysUserServiceImpl` 在写成功后通知 system 内的治理事件发布器；发布器只读取角色数量或状态前后值，不把角色 ID 集合、用户名、邮箱或密码交给 enterprise audit，监听器在业务事务提交前写入同一账本。
- `V11` 为设备增加 `last_heartbeat_audit_at`。heartbeat 更新和审计判定共享设备行锁，重复成功、并发心跳和多实例部署不会绕过限频。
- 管理端 API 信任边界只接受协议允许的扁平 metadata key/value；未知 key、嵌套对象和数组在进入 React 状态前被拒绝。
- 公共 Web 性能拦截器对 `/enterprise/**` 只记录方法、路径和耗时，不记录任何请求参数；其他路径按大小写无关的安全 key 集删除 Authorization 与 Token 参数。

## 自动化验收

后端定向门禁：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=PlusWebInvokeTimeInterceptorTest,T19AuditApiContractTest,UserGovernanceAuditListenerTest,AuditMetadataPolicyTest,AuditIntegrationTest,EnterpriseMigrationTest,DeviceLifecycleIntegrationTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

覆盖 HTTP/OpenAPI/cursor/权限、30-action metadata、同事务提交与回滚、真实 PostgreSQL requestId 查询/retention、V1 至 V11 空库与逐级升级、heartbeat 一小时限频和异常状态立即记录。

公共 Web 日志回归 `PlusWebInvokeTimeInterceptorTest` 共 2 项通过；enterprise 定向组合共 15 项通过。

协议与管理端门禁：

```sh
cd plugin
pnpm --filter @owndsh/contracts generate
pnpm --filter @owndsh/contracts check:generated
pnpm --filter @owndsh/contracts typecheck
pnpm --filter @owndsh/contracts test

cd ../admin-web
corepack pnpm vitest run src/api/enterprise/audit/index.test.ts \
  src/pages/enterprise/audit/index.test.tsx
corepack pnpm lint
corepack pnpm build:prod
```

contracts 43 个 fixture 与 9 项测试验证 audit schema/生成物无漂移；管理端验证严格解码、同 requestId 双记录和 metadata 按需展示，并通过 lint、TypeScript 与 production build。

## 真实 Server 与页面

```sh
cd admin-web
ENT_E2E_BASE_URL=https://127.0.0.1 \
node_modules/.bin/playwright test e2e/audit-pages.spec.ts --reporter=list
```

真实 PostgreSQL、Redis、最终 Server jar、production 管理端与受控 DeepSeek SSE 完成管理员、审计员和普通员工三组流程。结果：`1 passed (35.0s)`。

验收媒体：

- [`assets/t19-01-request-id-correlation.png`](assets/t19-01-request-id-correlation.png)
- [`assets/t19-02-metadata-whitelist.png`](assets/t19-02-metadata-whitelist.png)
- [`assets/t19-03-auditor-read-only.png`](assets/t19-03-auditor-read-only.png)
- [`assets/t19-audit-closure.gif`](assets/t19-audit-closure.gif)

GIF 为 `1280x720`、9 秒、90 帧，覆盖 requestId 双记录、metadata 白名单和审计员只读查询；媒体不含 Token、Authorization、provider credential、prompt 或真实用户数据。

## 敏感信息与边界

最终扫描覆盖 PostgreSQL `metadata_json` 的全部 key/value、审计 API 响应、Server 日志、PNG/GIF 和受控 E2E 凭据。metadata key 不得出现密码、Authorization、credential/secret、access/refresh token、prompt/message/tool、原始 Session event 或异常 stack 语义；运行时产物对受控 `t19-controlled-provider-credential`、`T19 controlled audit probe`、`AuditTest!42` 和 `Bearer ` 明文必须为零命中。首次最终扫描据此发现上游性能日志会打印企业请求体和 SSE query Token；T19 在公共 Web 边界修复并新增回归测试后重新构建、运行和扫描，不以测试断言替代真实日志证据。

最终数据扫描覆盖 42 条审计事件及 144 个 metadata key 实例：非 object metadata、禁用语义 key 和四个受控明文均为 0。最新 requestId 的审计 API 断言关联 2 条模型记录且序列化响应无 prompt、credential、Authorization、message、tool 或 stack。最终 Server 日志共 2402 行，四个受控明文各 0 命中；3 张 PNG 和 1 个 GIF 的逐文件字节扫描中四个受控明文各 0 命中，并完成页面视觉复核。

```sh
node scripts/upstream-baseline.mjs verify
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

三份产品上游锁匹配。同级 `deepseek-harness` 精确位于标签 `dsh-v0.1.0-rc.7`、提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 且工作区干净；T19 未修改 Harness 文件。

## 品味自检

- 审计写入仍跟随业务事务，查询/retention 是独立端口；没有把只追加 sink 扩成万能 repository。
- system 模块发布业务事实，enterprise 模块负责审计投影，依赖方向没有反转，也没有让基础用户模块认识审计 DTO。
- cursor 只携带单调 ID，筛选事实经认证 AAD 绑定；数据库 SQL 参数化且不拼接输入。
- metadata 白名单是类型系统和总覆盖测试共同执行的边界，不依赖字段名黑名单在运行时补漏。
- 企业请求日志采用整段省略，而不是尝试枚举正文中的未来敏感字段；非企业 query 仅保留安全参数，Token 不能借 SSE 参数绕过。
- heartbeat 限频状态落在业务事实同一行并受行锁保护，没有引入 Redis 双写、内存窗口或额外调度状态。
- 所有新增业务文件小于 800 行并带 L3；audit、system event、migration、tests、admin API/page/e2e、contracts、docs/assets 的 L2 与项目 L1、README、详细设计和本记录已回环。

## 改进建议

T20 应按详细设计第 18.3 节验证限流、请求体上限、关闭 drain、不可达/磁盘故障和备份恢复。审计层当前只保证应用级只追加与保留期查询，不宣称防数据库管理员篡改；不要在 T20 偷渡哈希链、SIEM 或风险评分。

## 任务边界

T20 是唯一下一项：执行安全负例、故障注入、日志扫描与恢复演练。T20 独立验收并提交前不得开始 T21。
