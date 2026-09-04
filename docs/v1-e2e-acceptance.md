<!--
[INPUT]: 依赖 v1-product-feature-catalog.md 的冻结范围、锁定 Desktop/Harness 基线、真实部署拓扑及当前控制台、LDAP/OIDC、模型治理、插件和审计实现。
[OUTPUT]: 提供 V1 全场景 E2E 用例、参数化覆盖维度、执行边界、隔离规则和逐项验收证据。
[POS]: V1 发布验收的执行真源；功能清单回答“做什么”，本文回答“怎样证明整条产品链路可用”，旧阶段测试仅作为回归旁证。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh V1 E2E 验收

状态：`accepted`

执行日期：2026-09-03 至 2026-09-04（Asia/Shanghai）

适用基线：DSH Desktop `2.0.3`、DeepSeek Harness `0.1.1-rc.2`。

## 1. 验收原则

本文仅覆盖 [V1 产品功能清单](v1-product-feature-catalog.md) 已冻结的能力，不把测试过程中想到的功能扩入 V1。SCIM、多级组、Workspace/Project、金额计费、服务端重试、排队、故障转移、MCP/Coding Rules 专用入口和 Session 同步均不是本轮实现目标。

旧 Java、TypeScript 和部署测试继续作为回归底座，但不计作 E2E 通过。一个 E2E 场景必须穿过真实外部入口和至少一个持久化或运行时边界，并从用户可见响应、客户端状态、PostgreSQL、Redis、上游调用次数、用量或审计中取得结果证据。

测试分工固定如下：

| 层级 | 职责 | 是否可单独宣称 V1 通过 |
|---|---|---|
| 协议/单元/集成回归 | 精确边界、时间计算、恶意输入、事务回滚和组件渲染 | 否 |
| 已部署 API E2E | 管理登录、CRUD、权限、LDAP/OIDC、数据库和 Redis 状态 | 否 |
| 锁定 Harness/Desktop E2E | 三协议、reasoning、重试、插件和设备实际行为 | 否 |
| 真实浏览器 E2E | Cookie 会话、跨标签、固定导航、登录与关键表单 | 否 |
| 本文全部适用场景 | 四层证据共同闭环 | 是 |

## 2. 隔离与恢复

- 所有临时名称统一使用 `v1e2e-<runId>-*`；只清理该前缀及本轮记录的精确 ID，不重建 PostgreSQL/Redis 数据卷。
- 管理凭据、LDAP manager 密码、OIDC secret、模型 API Key、Bearer Token 和 Cookie 只通过进程环境或内存传入，不写入仓库、验收文档和持久日志。
- LDAP、OIDC 和可控模型上游使用独立临时服务，加入现有 Docker 网络；测试后删除测试容器。
- 自动登录期间只对当前测试 Server 临时关闭验证码，并允许本机 HTTP OIDC fixture；结束后恢复正式启动参数，重新验证验证码启用和服务健康。
- 需要改密的场景只使用本轮创建的 LOCAL 成员，不修改日常管理员凭据。

## 3. 参数化覆盖

以下组合由表驱动场景覆盖，避免复制大量顺序依赖用例：

| 能力 | 完整取值 |
|---|---|
| 管理角色 | `enterprise_admin`、`model_admin`、`plugin_admin`、`auditor`、`employee` |
| 身份来源 | `LOCAL`、`LDAP`、`OIDC` |
| 模型协议 | `CHAT_COMPLETIONS`、`RESPONSES`、`ANTHROPIC_MESSAGES` |
| 授权主体 | `ALL_USERS`、`ACCESS_GROUP`、`USER` |
| 授权资源 | `MODEL_SET`、`MODEL` |
| Token 主体 | `ORGANIZATION`、`MEMBER` |
| Token 资源 | `ALL_MODELS`、`MODEL_SET`、`MODEL` |
| Token 窗口 | `FIVE_HOURS`、`DAY`、`WEEK`、`MONTH` |
| RATE 主体 | `ORGANIZATION`、`MEMBER`，另含 Provider 物理容量 |
| RATE 资源 | `ALL_MODELS`、`MODEL_SET`、`MODEL`，另含 `PROVIDER` |
| 插件分配 | `ALL_USERS`、`USER` |

## 4. E2E 场景

状态说明：`PENDING` 未执行，`PASS` 已取得证据，`FAIL` 已复现缺陷，`BLOCKED` 缺少不可替代外部条件。

### A. 部署与数据升级

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E01 | 当前 TLS Gateway、Server、PostgreSQL、Redis 均健康；只有 Gateway 暴露端口 | 部署 | PASS |
| E02 | 对现有数据卷原地启动当前镜像，迁移达到最新版本，升级前后的成员、模型、授权、策略、插件和账本基数不减少 | 部署 + PostgreSQL | PASS |
| E03 | OpenAPI 生成物、Console、Harness、部署配置和后端回归门禁无漂移、无失败 | 全仓回归 | PASS |

### B. 控制台登录、会话与角色

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E04 | 未登录访问控制台业务路由进入登录页，直接请求管理 API 返回 401 | 浏览器 + API | PASS |
| E05 | LOCAL 管理员经 Authorization Code + S256 PKCE 登录；只建立 `Secure/HttpOnly/SameSite=Strict` host-only Cookie，响应和浏览器存储没有平台 Token | 浏览器 + API | PASS |
| E06 | 错误账号、密码、验证码或过期 transaction 均不建立会话，错误不泄漏凭据是否存在 | API | PASS |
| E07 | 同域新标签直接复用服务端会话；任一标签注销后其他标签下一次 API 返回 401，刷新进入登录页 | 真实浏览器 | PASS |
| E08 | 当前用户正确旧密码改密后全部会话失效；错误旧密码不改密；其他标签下一次请求返回 401 | 真实浏览器 + API | PASS |
| E09 | 五种角色逐项验证固定页面和 Server 权限矩阵；多角色取并集，`employee` 不进入管理控制台 | 浏览器 + API | PASS |

### C. LOCAL 成员与身份生命周期

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E10 | 创建 LOCAL 成员后默认为 ACTIVE/employee/首次改密；初始密码不出现在响应、查询、审计和日志 | API + PostgreSQL | PASS |
| E11 | 初始密码登录只返回一次性改密 challenge；弱密码被拒，强密码成功，challenge 不可重放，之后可正常登录 | API | PASS |
| E12 | 用户中心显示基本信息、固定角色和 LOCAL 来源；安全设置独立承载改密 | 浏览器 | PASS |
| E13 | 成员停用立即撤销管理和 Harness 会话；最后管理员、最后登录身份和错误 revision 的保护边界生效 | API + Harness | PASS |

### D. LDAP 与 OIDC

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E14 | 创建真实 LDAP 身份源并连接成功；错误配置失败；manager secret 只可写不可读 | OpenLDAP + API | PASS |
| E15 | LDAP 用户有界搜索执行字段映射和 RFC 4515 转义；单人导入成功，重复导入幂等且默认无管理权限 | OpenLDAP + API | PASS |
| E16 | LDAP 登录/JIT 以稳定目录 subject 建号；重复登录命中同一成员，相同用户名或邮箱不跨身份源自动合并 | OpenLDAP + API | PASS |
| E17 | LDAP 组有界发现后显式映射到扁平产品组；DN 相同才命中，同名不同 DN 不串组 | OpenLDAP + API | PASS |
| E18 | 目录成员变化在登录或重新导入时重算；空组撤销旧 LDAP 来源关系，同时保留手工组关系；删除映射同样不误删手工关系 | OpenLDAP + API + PostgreSQL | PASS |
| E19 | LDAP 身份源停用后拒绝新认证，但不删除已有成员、身份和产品组 | OpenLDAP + API | PASS |
| E20 | 创建标准 OIDC 身份源并完成 discovery；client secret 只可写不可读，issuer/audience/nonce/PKCE 错误均拒绝 | OIDC fixture + API | PASS |
| E21 | OIDC Authorization Code 登录完成 JIT；稳定 subject 重复登录命中同一成员，同名 LOCAL/LDAP/OIDC 账号互不合并 | OIDC fixture + API | PASS |
| E22 | OIDC 身份源停用后拒绝新认证，不影响同一成员的其他登录身份 | OIDC fixture + API | PASS |

### E. 模型目录与访问授权

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E23 | DeepSeek 官方与自定义 Provider 均可配置；三种 wire API、认证要求及共享 RPM/并发字段准确持久化 | API + PostgreSQL | PASS |
| E24 | Provider 连接测试和模型发现成功；无列表接口时允许手工模型 ID；API Key 不回显，错误 revision 不覆盖新值 | 可控上游 + API | PASS |
| E25 | 受管模型正确保存模型 ID、显示名、上下文窗口、最大输出和 `reasoningEfforts`；停用后从 bootstrap 消失且调用被拒 | API + Harness | PASS |
| E26 | 两个 Provider 下相同上游模型 ID 通过不同受管模型 ID 保持可区分，授权和路由不串线 | API + Harness | PASS |
| E27 | 模型集增删模型立即影响后续授权解析；重复成员去重，被授权引用时删除受保护 | API + Harness | PASS |
| E28 | `ALL_USERS/ACCESS_GROUP/USER × MODEL_SET/MODEL` 六种授权均生效；多条 allow 为加法并去重，未授权模型不可见且不可调用 | API + Harness | PASS |

### F. Token 配额与 RATE

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E29 | `ORGANIZATION/MEMBER × ALL_MODELS/MODEL_SET/MODEL × 5小时/日/周/月` 全组合可创建、查询和独立计数；TOKEN/RATE 混填被拒 | API + PostgreSQL | PASS |
| E30 | 同时命中的组织与成员 Token 策略全部通过才允许调用，个人策略不能覆盖组织保底；不同资源范围独立结算 | Harness + PostgreSQL | PASS |
| E31 | 成功流式调用先预留后按 usage 结算；用量账本与窗口计数一致 | Harness + PostgreSQL | PASS |
| E32 | 建连失败释放预留；2xx 后断流或无 usage 按既定保守终态收敛；恢复任务幂等 | 可控上游 + PostgreSQL | PASS |
| E33 | `ORGANIZATION/MEMBER × ALL_MODELS/MODEL_SET/MODEL` RATE 组合全部可执行，重叠策略由一个 Redis 原子裁决全成全败 | Harness + Redis | PASS |
| E34 | Provider RPM/并发由不同成员和不同模型共享；达到上限立即 429，不进入服务端排队 | Harness + Redis | PASS |
| E35 | 成员 RATE 只收紧对应成员；其他成员不共享其计数；请求成功、失败和断开后并发租约均释放 | Harness + Redis | PASS |

### G. Gateway、Harness 与 429

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E36 | Desktop/Harness 企业登录后登记 installation 和设备，bootstrap 只返回当前成员可用模型与插件；发行 Host 不注册 Session 同步 service | 锁定 Harness + API | PASS |
| E37 | Chat Completions、Responses、Anthropic Messages 三协议分别完成真实 SSE 调用和 usage 结算 | 锁定 Harness + Gateway | PASS |
| E38 | Harness 生成的 tools、reasoning 和协议字段透明通过；网关只替换模型 ID，并仅对 Chat 流式请求补 `stream_options.include_usage=true` | 可控上游 + Gateway | PASS |
| E39 | 受管模型声明的 reasoning 档位进入 Harness 目录；选择 `xhigh` 后请求保持客户端定义的实际映射，Server 不自行降级或改写 | 锁定 Harness + 可控上游 | PASS |
| E40 | 上游瞬时 429 经企业两层代理保留状态与合法 `Retry-After`；锁定 Harness 按其官方默认策略识别 `RATE_LIMIT`、重试一次后成功，企业层不接管退避 | 锁定 Harness + 可控上游 | PASS |
| E41 | 企业 Token/RPM/并发 429 与上游硬 quota 429 都是终态，Harness 只请求一次；错误类别不混淆 | 锁定 Harness + Redis + 可控上游 | PASS |
| E42 | 上游 5xx、建连失败和 SSE 断开由 Harness 官方重试处理；企业 Gateway 自身不增加重试、降级或故障转移 | 锁定 Harness + 可控上游 | PASS |

### H. 插件、设备、审计与产品壳

| ID | 场景与通过条件 | 执行面 | 状态 |
|---|---|---|---|
| E43 | 危险路径、链接、原生模块、超限和不兼容 tgz 被拒；合法包可上传、签名、发布并按 ALL/USER 分配 | API + 制品存储 | PASS |
| E44 | Desktop/Web 按官方 CLI 安装、升级、回滚、卸载；需要重启时状态明确，重启后库存与控制台一致 | Desktop + Web Harness | PASS |
| E45 | 设备撤销后当前 Token、bootstrap、模型调用和插件下载立即失效，其他设备不受影响 | Harness + API | PASS |
| E46 | 一次模型调用可用 request ID 关联 usage 与审计；响应、审计 metadata 和普通日志不含 prompt、密码、Token、API Key 或外部 secret | API + PostgreSQL + 日志 | PASS |
| E47 | Session 页面和 Desktop 设置入口不存在，发行 Host 不注册或启动 Session 同步；登录、bootstrap、对话、插件调和和重启期间均无 Session API 请求 | 浏览器 + Harness + 访问日志 | PASS |
| E48 | 产品壳只显示五个主入口，身份接入归入成员、LDAP 映射在 LDAP 操作中；设置/系统/Session 不存在，主题和桌面/移动布局无溢出 | 真实浏览器 | PASS |

## 5. 执行记录

| 时间 | 命令/环境 | 结果 | 证据摘要 |
|---|---|---|---|
| 2026-09-03 | `OWNDSH_E2E_ADMIN_PASSWORD=*** node scripts/v1-e2e.mjs`，`runId=2ba8c996` | PASS | E01-E47 共 46 个纵向场景连续通过；覆盖真实部署、LOCAL/LDAP/OIDC、五角色、模型/配额/RATE、锁定 Harness 三协议与重试、插件生命周期、设备、审计及 Session 停用 |
| 2026-09-03 | `./mvnw -B -ntp -Dmaven.test.skip=false -DskipTests=false test` | PASS | 41 个 Reactor 模块成功；`owndsh-enterprise` 163/163、`owndsh-server` 13/13、`owndsh-common-web` 5/5 |
| 2026-09-03 | `corepack pnpm@11.24.0 check`（Console） | PASS | OpenAPI 生成、Vite production build、TypeScript 及 Vitest 38/38 通过 |
| 2026-09-03 | `corepack pnpm@11.7.0 check`（Harness） | PASS | 7 个插件包 77 项、workspace 4 项通过；contracts `check:generated` 无漂移 |
| 2026-09-03 | 部署、基线与格式门禁 | PASS | 部署 10/10；Desktop 派生 Harness `0.1.1-rc.2` commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；`git diff --check` 通过 |
| 2026-09-03 | 结算审计失败回归复验 | PASS | 旧测试误把 2xx 后企业错误帧当作契约；断言已对齐透明 SSE：保留已转发事件、无伪造错误、无 `[DONE]`，reservation 保持 SENT、ledger 为零且仅有 accepted 审计；定向 3/3 和全量均通过 |
| 2026-09-03 | Microsoft Edge 真实浏览器 E48 验收 | PASS | 使用真实 LOCAL 管理员会话确认五入口、成员内身份接入、LDAP 行内组映射及设置/系统/Session 缺席；主题计算样式随 light/dark 切换。首轮 390x844 检出表格工具栏和顶栏控件重叠，根因为嵌套 flex 换行与主题按钮共享滚动层；修复共享 DataTable 工具栏及 ConsoleShell 标签滚动边界后复验无可见重叠，根宽度 390/390，表格可横向滚动 753px，五标签可横向滚动 528px；1440x900 根宽度 1440/1440 且表格无需横向滚动 |
| 2026-09-03 | E2E 数据与环境恢复 | PASS | 按 7 个明确 runId 和已解析 ID 删除 28 个测试成员、21 个身份源、7 个组、21 个 Provider、35 个模型、14 个模型集、266 条策略、32 台设备及关联数据；8 个测试制品确认不存在；Server 已恢复验证码、禁止不安全 OIDC、移除 LDAP truststore，临时 LDAP 容器已删除 |
| 2026-09-04 | 企业 bundle 重建与安装复验 | PASS | 定向测试 3/3；源码构建产物与 Desktop `web` profile 安装包一致，Host 入口不包含 `enterpriseSessionSync` 或 `sessionPersistence` 注册 |
| 2026-09-04 | 真实 Electron GUI E36/E47 验收 | PASS | DSH Desktop `2.0.3` / Harness `0.1.1-rc.2` 以 `candidate.admin` 登录并登记设备 `2093124377457770497`；`gpt-5.6-luna` + `High` 会话 `Desktop E2E 2026-09-04 06:46` 收到 `DESKTOP_E2E_OK`，约 3 秒、首 token 3.2 秒。设置只剩账号与插件，资源轨迹只有 status/auth/start/bootstrap/plugins，Session 请求为 0 |
| 2026-09-04 | Electron 本地 TLS 根因复验 | PASS | 首次登录后的 `ENT_PLATFORM_UNAVAILABLE` 根因是 Electron 主进程不信任本地部署自签名 CA，授权回调已到达但 token 交换未成功；仅为 Desktop 进程注入部署 CA 后，同一构建完成登录、bootstrap 与真实聊天，全局启动环境未残留该变量 |
| 2026-09-04 | LDAP 组映射可见性复验 | PASS | 在身份源 `2095453940706836482`（`v1e2e-691ef521 LDAP`）下保留映射 `2095646076951117826`：`cn=engineering,ou=groups,dc=example,dc=org` → 产品用户组 `2095646076808511489`（`LDAP Engineering 验收组`）；Edge 行内映射列表显示 1 项 |

2026-09-03 的“锁定 Harness”记录由验收脚本直接驱动官方 Harness 运行面；2026-09-04 的“真实 Electron GUI”记录来自打包 Desktop 的可见登录和聊天流程。两者分别证明协议行为与最终桌面交付，不再混称为同一种客户端 E2E。

## 6. 发布判定

只有 E01-E48 中所有适用场景为 `PASS`，且临时容器、测试数据和测试启动参数已精确清理，才可把 V1 状态改为 `accepted`。任何失败先记录现象、根因、最小修复、回归用例和复验结果；不得用跳过、换新数据库、扩大超时或降低断言替代修复。
