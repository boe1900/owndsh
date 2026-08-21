# T22 端到端功能候选版验收记录

状态：`completed`

验收日期：2026-08-21（Asia/Shanghai）

## 结论

T22 已完成，且没有进入 T23。正式 Linux `amd64` release 在全新隔离安装中完成详细设计第 21.1 节 14 步：真实 OIDC/LDAP、受管 DeepSeek 模型、配额、双版本插件、三台锁定 rc.7 Harness、跨设备 Session 恢复、设备撤销、独立审计员和 tombstone 均通过。

最终自动候选结果为 `14/14`，Playwright `1 passed (3.3m)`；Harness 输出三设备接受证据，8 个候选日志文件敏感扫描为 0 命中。五张 `1280x720` PNG 和一张同尺寸 GIF 已生成。独立应用内浏览器随后检查第二台真实 Harness 的账号、插件和 Session 同步页，控制台 error 为 0。

本任务按已确认的 MVP 范围不下载 Trivy 漏洞库、不执行镜像漏洞扫描。该候选用于验证产品功能，不等同于生产上线安全评估。

## 核心实现

- `candidate-services.mjs` 以锁定 Node 镜像提供 HTTPS OIDC Authorization Code + S256/RS256 IdP 和 DeepSeek-compatible SSE upstream；OpenLDAP fixture 使用 LDAPS 和独立 CA。
- 双版本 `@enterprise-agent/candidate-tools` 真实 tgz 使用官方 package-name Loader 入口，覆盖 1.1.0 安装、重启确认及回滚到 1.0.0。
- `t22-candidate-harness.mjs` 为 first、bob、second 创建三个隔离 `DSH_HOME`，只调用锁定 Harness 官方 CLI/Web/Session/LLM 能力，并通过本地有界控制面与 Playwright 协作。
- `t22-candidate.sh` 从全新状态目录安装正式 release，生成三套独立 TLS 信任边界、事务 seed 最小 auditor、执行 14 步、收集失败日志、扫描 secret、生成媒体并检查 Harness checkout 干净。
- `t22-release-checks.sh` 串行执行完整 Backend、管理端、Harness workspace、OpenAPI drift、真实 package consumer、Compose、release 完整性和同一 tarball 候选验收；显式排除 Trivy。
- T22 migration seed 只存在于 E2E fixture：它复制一次性管理员初始 hash 创建 `candidate.auditor`，仅绑定固定 `auditor` 角色；管理员首次改密后凭据立即分离，测试账号不进入生产 migration。
- 动态候选 CA 使用宿主随机密码创建并校验 JKS；容器只读挂载证书库，JSSE 不接收创建密码，避免 JVM 把 `trustStorePassword` 写入启动日志。

## 端到端发现与修复

候选流程不是只录制 happy path；它实际暴露并修复了以下跨模块问题：

- Session bootstrap 原先仍返回 `enabled=false`，使已经交付的 T16-T18 能力无法在正式 release 启动；现已启用 90 天、1 MiB 策略并同步协议 fixture。
- PostgreSQL 对无部门用户解析 DEPT grant 时无法推断空参数类型；SQL 现在显式转换为 `bigint`，未授权 Bob 能稳定得到 `ENT_MODEL_NOT_ASSIGNED`。
- Harness 平台刷新期间本地插件/Session 请求曾被误判未登录；`REFRESHING` 现在与内存 Token 的实际可用期一致。
- 模型拒绝响应是 JSON，Harness adapter 原先只声明 SSE；Accept 现同时协商 `text/event-stream` 和 `application/json`，稳定领域错误不再退化成媒体类型错误。
- Sa-Token 设备撤销原先被全局登录拦截器提前翻译为通用 401；现在 Token Session 保留撤销 marker，企业路由完整下沉到领域 resolver，四路负例都返回设备撤销语义，第二台继续可用。
- Nginx 原先把 `/enterprise/` 全部代理到 Server，吞掉管理端 callback SPA；现在认证 callback、admin/api/auth 命名空间分流明确，并从实际 HTTPS 端口生成可信 forwarded port。
- release/运维脚本原先只支持 GNU `sha256sum`；共享 helper 现在兼容 macOS `shasum -a 256`，同时保持 release/备份清单格式不变。

## 14 步结果

| 步骤 | 真实结果 |
|---|---|
| 1 | 创建 Candidate OIDC、连接测试 `READY`，engineering 组映射到研发部门。 |
| 2 | 创建 DeepSeek provider；API 不回显 credential，PostgreSQL 仅有 AES-GCM ciphertext/12-byte nonce/key version。 |
| 3 | 创建 `deepseek-chat`、研发部门默认授权及日/月/RPM/并发配额。 |
| 4 | 上传并发布 1.0.0/1.1.0 真实 tgz，分配新版本。 |
| 5 | Candidate Alice 在第一台官方 rc.7 Harness 完成系统浏览器 PKCE，设备注册成功。 |
| 6 | `ctx.llm` 发现默认模型并完成真实 SSE、usage、ledger/window/audit 闭环，员工侧无上游 Key。 |
| 7 | Candidate Bob 无授权时目录为空，手工 alias 调用返回 `ENT_MODEL_NOT_ASSIGNED`。 |
| 8 | 收紧配额后下一请求被拒绝，窗口/ledger 无负数；恢复配额后第二台仍可调用。 |
| 9 | 1.1.0 下载、验签、安装、重启 ACTIVE；管理员切回 1.0.0 后同样完成回滚。 |
| 10 | 第一台生成含工具事件的 Session，管理端按权限读取正文。 |
| 11 | 第二台恢复为新 Session ID，seed seq/type/data/hash 一致，并继续写入新事件。 |
| 12 | 撤销第一台后 bootstrap/model/plugin/sync 四路全部失败，第二台流式模型继续成功。 |
| 13 | 独立 auditor 按 requestId 查到 accepted/finished，并覆盖插件、同步、正文读取和撤销审计。 |
| 14 | 第二台删除源 Session，事件行归零且保留 tombstone；撤销设备不能自动传回。 |

## 环境与制品

```text
Git 2.39.5
Node.js 24.14.1
admin pnpm 10.34.5
Harness pnpm 11.7.0
OpenJDK 21.0.12
Docker Engine 28.5.2
Docker Compose 2.40.3
Docker runtime: linux/amd64
Harness: dsh-v0.1.0-rc.7
Harness commit: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
```

通过候选验收的 release：

```text
enterprise-agent-platform-0.1.0-t22-linux-amd64.tgz
size: 312 MiB
SHA-256: c4a8ca53b7c7e177f1e9284ee782825cd15e02c4f860a6360a77cd14f3b17f6f
```

自动候选命令：

```sh
EAP_T22_RELEASE_TARBALL=/tmp/enterprise-t22-release-final-3/enterprise-agent-platform-0.1.0-t22-linux-amd64.tgz \
  ./scripts/t22-candidate.sh
```

结果：Playwright `1 passed (3.3m)`；`T22_HARNESS_ACCEPTED` 包含 first/bob/second 和 3 个隔离 home；日志秘密扫描 `8 个文件，0 命中`；脚本最终输出 `14/14`。

最终总门禁：

```sh
EAP_USE_LOCAL_BASE_IMAGES=1 ./scripts/t22-release-checks.sh
```

门禁不执行 Trivy；完整 Backend、管理端、Harness/consumer、Compose、release 和同制品 14 步均为必需成功条件。

2026-08-21 最终从头复跑以退出码 `0` 完成全部 `7/7` 门禁：Backend 41 模块构建成功，企业模块 `140/140`、`ruoyi-admin` `10/10`；管理端 10 个测试文件 `23/23`、fixture `5/5`；Harness workspace、OpenAPI drift 及 contracts/platform-client/plugin-distribution/session-sync/bundle 真实 package consumer 全部通过，且 consumer 中 ambient shim 不存在；部署静态门禁 `10/10`、日志扫描器 `3/3`；最终由本轮唯一 release 再次完成候选 `14/14`，8 个日志文件敏感扫描 0 命中。同级 Harness 在门禁结束时仍为锁定 commit 且工作区干净。

## 人工桌面验收

使用 Codex 应用内 Browser 独立打开自动流程暂停的第二台锁定 Harness，并实际切换企业三个 tab：

- 账号：显示“已连接”，Candidate Alice、设备 UUID、正式平台 HTTPS 地址和 bundle `0.1.0` 均完整可见。
- 插件：显示 `@enterprise-agent/candidate-tools`、本地 1.0.0、assignment revision 和期望安装状态。
- 会话同步：待同步 0、确认游标 18、状态“已同步”，远端恢复副本为 19 个事件，恢复/删除操作布局清晰。
- 页面标题为 `DeepSeek Harness`，浏览器控制台 error 为 0；桌面视口无空白、遮挡或文本溢出。

管理端身份源、Session tombstone 与 Harness 关键状态另由同一真实流程的五张 PNG 逐张视觉复核；页面无空白、遮挡和敏感值。

本地人工复核默认保留 10 分钟，避免 CI 异常后永久遗留容器；可通过 `EAP_T22_MANUAL_ACCEPTANCE_TIMEOUT_MS` 设置 1 分钟至 24 小时的有界窗口。Playwright 总超时会同步扩展，例如设置 4 小时：

```sh
EAP_T22_MANUAL_ACCEPTANCE=1 \
EAP_T22_MANUAL_ACCEPTANCE_TIMEOUT_MS=14400000 \
EAP_T22_RELEASE_TARBALL=/path/to/enterprise-agent-platform-0.1.0-t22-linux-amd64.tgz \
  ./scripts/t22-candidate.sh
```

## 媒体证据

- [`assets/t22-01-candidate-governance.png`](assets/t22-01-candidate-governance.png)：管理端 OIDC `READY` 与密钥脱敏。
- [`assets/t22-02-harness-model-ready.png`](assets/t22-02-harness-model-ready.png)：真实 Harness 企业账号、设备和平台连接事实。
- [`assets/t22-03-plugin-rollback-active.png`](assets/t22-03-plugin-rollback-active.png)：受管插件回滚版本及 Loader 状态。
- [`assets/t22-04-session-restored.png`](assets/t22-04-session-restored.png)：第二台 Session 新 ID 恢复、同步游标和远端列表。
- [`assets/t22-05-audit-tombstone.png`](assets/t22-05-audit-tombstone.png)：管理端审计完成后的 Session tombstone 页面。
- [`assets/t22-end-to-end-candidate.gif`](assets/t22-end-to-end-candidate.gif)：五个关键状态组成的无密钥候选流程。

## 品味自检

- 产品 release、测试 fixture 和同级 Harness 三个边界物理分离；测试 seed、CA、账号和控制面不会进入生产制品。
- 撤销原因保存在 Token Session，领域 resolver 负责翻译；全局安全层不复制设备业务规则。
- 候选只通过公开 API/页面建立产品事实，数据库仅用只读探针验证密文、事件删除和 tombstone；唯一写入是详细设计允许的前置 migration seed。
- 每轮使用全新 Compose project、状态目录、卷、端口和三套 Harness home，失败现场只读取去敏 `logs/`，不读取含 secret/私钥的 `state/`。
- 新增手写文件均小于 800 行并带 L3；e2e/fixtures/support/scripts/docs/assets 的 L2 与项目 L1、README、详细设计和本记录已回环。

## 改进建议

T23 若启动，应只部署 20 用户、2 部门、2 周试点并收集第 21.2 节指标；不要把漏洞治理、多节点、高可用或移动端能力混入试点。生产上线前仍需单独定义供应链、镜像漏洞、外部渗透和运维审计阶段，不能把本次“不执行 Trivy”误读为生产安全结论。

## 任务边界

T23 是唯一下一项，但本提交没有开始试点、创建长期部署或收集真实用户数据。同级 `deepseek-harness` 保持锁定提交和干净工作区。
