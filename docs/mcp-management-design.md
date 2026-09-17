<!--
[INPUT]: 依赖 OwnDsh 现有身份/RBAC/revision/API 规范、Harness 两个明确版本的源码及 MCP OAuth SDK。
[OUTPUT]: 提供 MCP 第一版产品边界、字段、数据模型、管理/运行时接口与权限的实施规格。
[POS]: docs 的 MCP 设计入口，与 mcp-runtime-design.md、mcp-implementation-plan.md 共同约束实现；未来接口不等于已发布接口。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh MCP 详细设计

修订日期：2026-09-16。状态：第一版实施规格；实现进度与验证事实见实施文档，不能把源码核对当作 E2E 通过。

阅读顺序：[本文件](mcp-management-design.md) → [端侧运行时](mcp-runtime-design.md) → [实施任务与验收](mcp-implementation-plan.md)。三份文件组成一份设计；字段以本文为准，运行顺序以运行时文档为准。

## 1. 交付边界与不可变决策

第一版一次完整交付：远程 Streamable HTTP、none/API Key/用户 OAuth、企业目录和授权、端侧连接 UI、按对话搜索工具、native/PTC/both 呈现、停用撤销及故障恢复。静态认证和 OAuth 可以分阶段开发，完成全部验收后才宣称第一版完成。

| 决策 | 冻结行为 |
|---|---|
| MCP 协议 | 官方 `@deepseek-ai/dsh-mcp-client`；不复制其 tools/list、tools/call、结果投影 |
| 管理事实 | OwnDsh Server 只管公共连接声明和成员授权 |
| 用户凭据 | Host 的 Harness credentials provider；OAuth access token 只在 Host 内存 |
| OAuth | OwnDsh 组织流程；复用 MCP TypeScript SDK 的发现/授权辅助函数；token 生成静态 headers 后重挂载官方 client |
| MCP 连接 | 单用户 Host 复用连接；用户首次点击连接，assignment 不自动发起 OAuth |
| 工具目录 | 端侧通过 tools/list 动态发现；搜索与呈现受运行时上下文预算约束 |
| 呈现 | 默认 search；full 受端侧上下文预算约束 |
| 会话 | 每个 live agent 独立 hot set；不把用户 token 或 hot set 写入 preset |
| 宿主会话能力 | AgentLoop、会话保存/恢复、compaction/spill 由 Harness 实现；OwnDsh 只负责 MCP 工具投影、会话隔离和执行权限的接缝回归 |
| 执行 | 保留 Harness 完整 tools pipeline；授权使用 monotonic guard，呈现使用 assemble waterfall |
| 老客户端 | MCP 配置放独立 runtime 切片，避免破坏现有严格 bootstrap decoder |
| 撤销 | 无闲置轮询；活动时授权快照最多有效 60 秒，过期无法刷新则拒绝新 MCP 调用 |
| 信任 | 端侧是合作式治理，不是对恶意本机管理员/插件的安全沙箱；强制审计和网络隔离需要未来代理 |

第一版明确不做：stdio 分发、legacy HTTP+SSE、resources/prompts、MCP server 发起的 sampling/elicitation、client_credentials/confidential OAuth client、组织共享 token、向量检索、跨设备凭据同步、MCP 服务端代理。出现这些配置时返回不支持，不能静默降级。

### 1.1 产品形态与页面归属

MCP 继续属于 **OwnDsh 标准插件**。发布物只有现有的 `owndsh-plugin`，安装、升级、验签和卸载入口都不增加第二个 MCP 插件或独立 `dsh` 包。

端侧运行时可以在 `plugin/packages/*` 中拆成内部 workspace package，以便隔离职责和测试；它必须由 `plugin/packages/bundle` 组合进同一个 `owndsh-plugin`，不单独发布、安装或出现在插件市场。实现任务中的 `mcp-runtime` 是代码模块名，不是产品插件名。

员工侧 MCP 页面固定放在 **OwnDsh 设置 → MCP** tab，通过官方 Settings/shell.overlay 接缝注入。该 tab 只处理当前用户的连接意愿和凭据：输入 API Key、OAuth 授权/重新授权、启用/禁用、断开连接、查看工具简介与连接/错误状态。它不提供组织级配置或成员授权。

企业管理面继续使用独立 **OwnDsh Console + Server**，MCP 使用独立一级菜单 `/mcp`。页面沿用“模型 / 访问策略”的布局：标题右侧通过共享 SegmentedControl 切换“服务配置 / 访问授权”，一次只显示当前 ProductDataTable，添加操作通过 ProductDialog 弹窗提交；凭据边界说明放在表格下方。复用控制台的权限路由、成员/用户组选择器、Query 和 OpenAPI client，管理公共 URL/headers/认证声明、启停、授权主体、revision/CAS 和审计；Server 是唯一事实源。

| 能力 | OwnDsh 插件（员工 Host） | OwnDsh Console/Server（企业控制面） |
|---|---|---|
| 当前账号、Server 地址、设备状态 | 读/改当前设备范围 | 只读审计或设备管理入口 |
| 用户 API Key、OAuth 授权与 refresh | 保存用户凭据，执行连接生命周期 | 只声明认证方式和公共参数，不接收用户秘密 |
| MCP 服务公共配置 | 只读脱敏结果 | 创建、编辑、启停、revision/CAS |
| 成员/用户组授权 | 展示当前用户是否获授权 | 授权、撤销、并集解析 |
| 工具目录 | 展示端侧动态发现的可用工具摘要 | 不在管理端维护 Tool 白名单 |
| 连接测试与诊断 | 以用户身份实际连接并报告脱敏状态 | 结构校验、状态聚合，不代连用户 URL |
| 多成员、RBAC、审计、数据库事务 | 提供入口跳转或结果展示 | 唯一权威实现 |

这里要区分“一个插件”与“一个运行位置”。产品坚持 **一个安装包原则**：员工能使用的企业能力，包括账号、设备、受管插件、MCP 凭据与连接，都由同一个 `owndsh-plugin` 在 OwnDsh 设置中提供；绝不再安装一个 MCP 插件。组织级页面仍由同一产品的 Console/Server 承载，因为成员授权、RBAC、审计、多人并发编辑和数据库事务必须在服务端形成权威事实。插件可以显示结果并提供进入 Console 的入口，但不复制这套权威逻辑。两者组成一个 OwnDsh 产品，而不是拆成多个插件。

## 2. 源码依据与前版纠正

### 2.1 版本真相

历史 checkout/`upstream/deepseek-harness.lock.json`：`0.1.1-rc.2`，commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。
当前 `plugin/packages/bundle/package.json` 的官方 peers/devDependencies：`0.1.5-rc.2`，bundle 的运行时映射为 commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`。两者不一致是现状，本设计不改已有版本锁。
MCP 新能力以 **0.1.5-rc.2** 为目标；开发前确认实际发行运行树。不能拿旧 checkout 测试通过声称新版组合完成。老版只保留研究证据，不新增双版本兼容分支；不满足新 MCP 依赖的 Host 提示升级，既有平台功能仍可用。
官方 npm `dsh-tools@0.1.5-rc.2` 的 Cordis peer 是 `^4.0.2`；现有 workspace 开发锁 `4.0.1` 不能直接用于目标组合。P2-MCP-00 应同步升级官方 peer/dev 锁并验证唯一实例，不用 --force/legacy-peer-deps 掩盖冲突；本次文档任务不修改依赖清单。

| 事实 | 源码核对结果 |
|---|---|
| client transport | 两个版本均支持 stdio 和 streamable-http；HTTP 配置只传静态 headers，没有 authProvider |
| 工具过滤 | 官方 client 没有 selected-tools 配置；连接后自动注册其发现的全部工具 |
| 工具重同步 | `syncTools` 获取完整列表后 dispose 旧注册、注册新世代；不能承诺“未变化工具不重新注册” |
| 命名 | `serverName` 需满足 `[A-Za-z0-9_-]{1,32}`；publicName 最长 64，可能带 hash；不能反向解析 rawName |
| tools.restrict | 可撤销的 scoped 可见性/查找/执行 mask，不会销毁全局定义；不能称作全局注销 |
| 呈现版本 | rc.2 是 native/code/both；0.1.5-rc.2 是 native/ptc/both |
| Code/PTC | `tools:sdk` 独立包含工具定义；仅过滤 `assembly.tools` 不足以减少 SDK 上下文 |
| 连接可观测性 | public apply 返回激活完成，无连接健康/HTTP 401 的标准状态服务；UI 不推断实时健康 |
| 扩展边界 | `systemPrompt.tools` 是添加 provider，不是替换已有 tools provider；本设计用 assemble waterfall |

源码固定链接：

- [官方 MCP client](https://github.com/deepseek-ai/deepseek-harness/tree/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/mcp/mcp-client)
- [tools 注册/执行/PTC](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/core/tools/README.md)
- [system-prompt assembly](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/core/system-prompt/README.md)

### 2.2 平台与开源参考的使用范围

| 参考 | 采用什么 | 不由该参考推出什么 |
|---|---|---|
| [Anthropic Tool Search](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/tool-search-tool) | 延迟提供工具定义，目录与每次请求分离 | 不假设 DeepSeek 模型支持 Anthropic `defer_loading` wire 字段 |
| [Cursor MCP](https://docs.cursor.com/context/model-context-protocol)、[Windsurf MCP](https://docs.windsurf.com/windsurf/cascade/mcp) | 用户配置/项目配置与启停的产品参考 | 未做二者运行时源码验证，不把“自动搜索”当作已证实能力 |
| [ArvinQi/dsh-mcp](https://github.com/ArvinQi/dsh-mcp) | search/full、hot set、assembly 过滤、稳定排序 | 本机 storage/patch/vendored client 不整体移植；全局 hot set 改为每 agent |
| [Js2Hou/dsh-mcp-manager](https://github.com/Js2Hou/dsh-mcp-manager) | 配置 UI、连接诊断、启停生命周期 | 不编辑用户 cordis.patch.yml |
| [hyqhyq3/dsh-mcp-manager](https://github.com/hyqhyq3/dsh-mcp-manager) | OAuth 交互与 broker 思路 | 不把 token 文件和本地事实源搬到平台，不下发任意 stdio |

没有任何公开方案替 OwnDsh 决定授权撤销、用户凭据归属或会话隔离；这三项由本设计定义。

## 3. 产品流程

1. 管理员在 `/mcp` 的“服务配置”tab 通过“添加 MCP”弹窗创建服务。初始 DISABLED。
2. 填连接、认证信息并启用；给试用成员授权。
3. 员工在「OwnDsh 设置 → MCP」点击连接，输入 Key 或完成 OAuth。Host 通过 MCP `tools/list` 动态发现工具。
4. 端侧按 search/full 和上下文预算决定提供给模型的工具元数据；高风险调用沿用 Harness 用户确认。
5. 模型搜索命中 → 当前会话加载 schema → 正常 Harness tool call → 端侧直连 MCP。
6. 目录新增或 schema 改变由端侧刷新；管理员停用/撤销在授权快照有效期内收敛。

管理端“校验配置”只做结构校验，不从 Server 发起用户 MCP 请求。实际测试在端侧使用用户身份进行。管理端不能把他人一次连接结果标成所有用户在线。

## 4. 公共字段契约

以下是待落入 OpenAPI 的明确规格，不是已经存在的接口。JSON 使用 camelCase；ID 是正十进制字符串；revision 使用现有安全整数；时间为 UTC RFC3339；未知字段拒绝。

### 4.1 McpServerView / Create / Update

| 字段 | 类型、缺省、校验 | 写入规则 |
|---|---|---|
| id | ID | Server 分配，只读 |
| revision | integer 0..9007199254740991 | 只读，写操作通过 If-Match |
| serverName | string 1..32，`[a-z][a-z0-9_-]*`，禁止 `__` | tenant 内唯一，创建后不可改；大小写统一小写 |
| displayName | string 1..120，trim 后非空 | 可改 |
| description | string 0..1000，默认空 | 人类说明，不作为系统指令 |
| transport | literal `streamable-http` | 不接受 command/args/env/cwd |
| url | HTTP(S)，长度 ≤2048，无 userinfo/hash | 完整 endpoint；不能内含凭据 |
| allowInsecureTransport | boolean false | HTTP 必须显式 true；UI 说明流量可能明文 |
| headers | string map，默认 {}，≤16 项，合计 ≤8 KiB | 仅公共常量，不接收 API Key；规则见 4.3 |
| auth | none / api-key / oauth discriminated object | 见 4.2 |
| toolCallTimeoutMs | integer，默认 60000，1000..300000 | 对齐官方字段 |
| reconnect | object，默认见下文 | 对齐官方字段 |
| presentation | `search` / `full`，默认 search | 不改变工具授权 |
| status | ACTIVE / DISABLED | 创建固定 DISABLED；独立动作修改 |
| createdAt / updatedAt | timestamp | 只读 |

Create 只含可写连接字段，reconnect 缺省 `{enabled:true,initialDelayMs:500,maxDelayMs:30000,maxAttempts:10}`。
Update 是相同连接字段的完整替换，不含 serverName/status；服务器不接受隐式部分覆盖。`initialDelayMs` 100..30000、`maxDelayMs` 100..300000 且不小于 initial、`maxAttempts` 1..20。
`failOnStartupError` 不暴露给管理员：Host 挂载隔离的官方 client 时固定 true，让失败明确回滚该实例而不阻断平台登录；首次重试由用户触发，已建立连接的掉线由官方 reconnect 负责。


### 4.2 Auth 三种结构

```json
{"type":"none"}
```

```json
{"type":"api-key","headerName":"Authorization"}
```

headerName 为合法 HTTP token，≤128，默认 Authorization。端侧只接收一个完整认证值，按原样写入该 Header；不补 Bearer、不去前缀、不按 Header 名称推断格式。需要 Bearer 认证时用户输入 `Bearer xxx`，需要裸 Key 时输入 `xxx`。管理端不提供 valuePrefix；固定版本号等公共参数通过独立的固定请求头键值表配置，与用户认证值在端侧合并。

```json
{
  "type":"oauth",
  "discovery":"mcp",
  "issuer":"https://identity.example.com",
  "clientRegistration":"pre-registered",
  "clientId":"public-client-id",
  "scopes":["read"],
  "resource":"https://mcp.example.com/mcp",
}
```

| OAuth 字段 | 冻结规则 |
|---|---|
| discovery | `mcp` 默认：PRM → AS 元数据；`manual`：配置下面两个 endpoint |
| issuer | 必填、HTTPS、≤2048；选择/绑定 AS，禁止发现结果任意换 issuer |
| authorizationUrl / tokenUrl | manual 时必填，mcp 时禁止；HTTPS，无 fragment/userinfo |
| clientRegistration | pre-registered 默认 / dynamic；dynamic 必须显式开启 |
| clientId | pre-registered 必填，1..255；dynamic 时禁止；服务端动态注册返回的 public clientId 仅保存在用户 Host |
| scopes | ≤32 个唯一项，每项 1..120，无空格/控制字符；UI 显示实际授权范围 |
| resource | 必填、HTTPS，无 fragment；按 RFC8707 传到授权、交换、refresh，不等同于私自新增 audience |
| callback | 由 OwnDsh 端侧根据 Host 部署能力选择 loopback 或固定 HTTPS；管理端不保存 callback 地址 |

`client_secret`、密码授权、任意 extraParams 不受支持。provider 特有 audience 尚未实现时提示不兼容，不能默默丢掉。OAuth 的 MCP resource endpoint 必须 HTTPS，即便平台自身用 HTTP 也不能据此降低 OAuth 要求。

### 4.3 Headers、URL 与配置改变

- 创建/编辑弹窗均支持添加、修改和移除固定请求头，最多 16 项、合计 ≤8 KiB；管理端与 Server 校验一致。headers 的 key 大小写不敏感去重；拒绝 Authorization/Proxy-Authorization/Cookie/Set-Cookie/Host/Content-Length/Connection 与 MCP-Session-Id/MCP-Protocol-Version。
- API Key 的目标 header 从动态凭据生成，不能与公共 headers 重名；上述 hop-by-hop、cookie 和 MCP 协议头也不能作为 auth.headerName。
- 每个公共 value ≤1024，无 CR/LF/NUL。公共不等于可以安全识别秘密：表单明确要求不填秘密，后端禁止专用秘密字段，不能声称能检测所有伪装 token。
- 管理声明信任合法企业私网 endpoint；不默认禁止 RFC1918。禁止云 metadata/link-local/unspecified/multicast 和 URL 字面量 loopback。DNS 与实际出站策略限制见运行时文档，不能仅靠字符串校验宣称防 DNS rebinding。
- url、headers、auth、transport 安全相关设置变化时，用户必须重新连接；旧 token 不对新 endpoint 复用，Tool 由端侧重新发现。
- displayName/description/presentation/timeout/reconnect 更新不清空准入。timeout/reconnect 变动重挂载，别名/准入/呈现变动仅重新投影。
- serverName 不复用已经删除过的身份；第一版无物理删除，DISABLED 保留历史引用。

## 5. 存储与授权裁决

复用现有 enterprise 模块、JDBC、事务、ID、tenant 和 UTC conventions。以下表名为新增逻辑名；迁移使用当时下一个 Flyway 版本，不预占已存在的 V 号。

### 5.1 ent_mcp_server

| 列 | 类型/约束 |
|---|---|
| id / tenant_id | bigint PK / 与现有 tenant 字段类型长度一致 |
| server_name / display_name / description | varchar(32)/(120)/(1000)，NOT NULL |
| transport / endpoint_url | varchar(32) CHECK streamable-http / varchar(2048) |
| allow_insecure_transport / headers_json / auth_json | boolean / jsonb object / jsonb object，均 NOT NULL |
| tool_call_timeout_ms / reconnect_json / presentation | integer / jsonb object / varchar(8) CHECK search,full |
| status / revision | ACTIVE,DISABLED / bigint ≥0 |
| created_at / updated_at | 与已有模块一致的 UTC timestamp |

UNIQUE(tenant_id,server_name)、UNIQUE(tenant_id,id)。业务验证与 DB CHECK 双重保证 enum、JSON 根类型、整数范围。jsonb 内部细节由与 OpenAPI 对齐的领域验证器校验；不另存同义字段。

### 5.2 ent_mcp_grant

字段：id、tenant_id、server_id、subject_type、subject_id nullable、status、revision、created_at、updated_at。
subject_type 固定为 `ALL | GROUP | USER`，与 MCP OpenAPI 一致；ALL 的 subject_id 必须 null，GROUP/USER 使用有效用户组/成员正 ID。status ACTIVE/DISABLED。现有模型授权枚举不改名，二者共享成员与用户组事实。
复合 FK (tenant_id,server_id) → ent_mcp_server，跨租户引用按不存在处理。统一使用 UNIQUE NULLS NOT DISTINCT (server_id,subject_type,subject_id)，同时保证 ALL/null 与指定主体不重复。

裁决公式：active user/device ∩ ACTIVE server ∩ (ALL ∪ 当前 USER ∪ 有效 GROUP)。多条 grant 命中同一 server 去重；撤回一条仍有其他授权则仍可用。工具能力由 MCP Server 动态声明，不在管理端维护 Tool ACL。
用户组成员变化必须同事务推进现有 bootstrap revision，复用既有用户组治理和身份导入入口。GROUP 通过同 tenant 的 ent_access_group 联接 ent_access_group_member，以 exists 同时识别 MANUAL 和 IDENTITY_SOURCE 成员并去重；创建授权时锁定组，仍被模型或 MCP 授权引用的组禁止删除。

### 5.3 ent_mcp_catalog_candidate

端侧可上报**运行时目录**供审计和诊断，保存：id、tenant_id、server_id、device_id、server_revision、catalog_digest、tools_json、observed_at、received_at。
UNIQUE(tenant_id,server_id,device_id)，每设备只保留最近一次；每服务最多 20 份，写入事务删除最旧候选；7 天清理。复用现有 retention 调度方式，不新增常驻服务。
工具项是 `publicName, description, parameters, outputSchema, schemaDigest`，没有工具参数实例、返回正文、token、URL。description ≤1000 字符，单工具 canonical schema ≤16 KiB，单 snapshot ≤1 MiB、≤512 工具。canonical 输入明确定义在运行时文档。

不同用户的同名工具定义可能不同；端侧以当前连接返回的最新 schema 为准，不把不同版本合并。
目录由端侧上报，可信级别是 CLIENT_REPORTED。Server 重新计算摘要、验证 JSON Schema 支持子集、限制深度/节点和体积；不能证明远端服务器或本机插件可信。目录仅用于观察，不产生 Tool 白名单或执行授权。
目录变化不递增授权 revision，不改变用户授权；端侧按运行时策略刷新 Tool。

### 5.4 写事务与失效

- Create/grant batch：使用 MCP 专用 PostgreSQL 幂等表；事务先占位、成功后保存资源 ID，同 key 同请求返回原结果，不同请求 409，失败事务不留记录，并发请求由幂等行锁串行化。
- Update/enable/disable/grant update/delete：If-Match 必填，使用现有数字 revision 协议；CAS 失败 409，返回 expectedRevision/actualRevision，不覆盖他人修改。
- 一次成功变更：数据 + entity revision + tenant bootstrap revision + 封闭 audit metadata 同事务提交。noop 不推进 revision，不重复审计。
- 目录上报/读取和本机运行状态不修改授权 revision。
- bootstrap/current MCP snapshot 必须同一数据库一致性视图读取有效 grants 和 revision；不能先读新 revision 再返回旧权限。

## 6. 平台 API 逐项契约

继承现有 envelope `{data,requestId}`、错误 envelope、签名 cursor/limit（默认50/最大200）。管理员用现有 HttpOnly Cookie；runtime 用 ACTIVE 设备的 Bearer 身份。tenant/member/device 全从可信会话解析，禁止客户端指定。

### 6.1 管理 API

| Method/path（前缀 /enterprise/admin/v1） | 输入 → 输出 | 权限 / 写并发 |
|---|---|---|
| GET /mcp-servers | cursor,limit,status?,q? → McpServerPage | ent:mcp:read |
| POST /mcp-servers | McpServerCreate → McpServerResponse，201 | ent:mcp:write，Idempotency-Key |
| GET /mcp-servers/{id} | → McpServerResponse | read |
| PUT /mcp-servers/{id} | McpServerUpdate → McpServerResponse | write，If-Match |
| POST /mcp-servers/{id}/actions/enable | {} → McpServerResponse | write，If-Match |
| POST /mcp-servers/{id}/actions/disable | {} → McpServerResponse | write，If-Match |
| GET /mcp-servers/{id}/catalogs | cursor,limit → CandidatePage | read |
| GET /mcp-grants | serverId?,cursor,limit → McpGrantPage | read |
| POST /mcp-grants | `{items:[GrantCreate]}` ≤100 → GrantResponse[] | grant，Idempotency-Key；全成功或回滚 |
| PUT /mcp-grants/{id} | `{status}` → GrantResponse | grant，If-Match |
| DELETE /mcp-grants/{id} | → 现有 DeletedResourceResponse | grant，If-Match |

`GrantCreate={serverId,subjectType,subjectId,status}`；HTTP ID 均为十进制字符串，ALL 的 subjectId 明确传 null；响应加 id/revision/createdAt/updatedAt。已删除 grant 再删返回 404，第一次删除后的重复请求遵循现有 controller 语义，不混写 204/200。
授权更新只修改 status，server/subject 保持不变，调整主体通过删除后重新授权完成。更新与删除先按 tenant 锁定授权行并校验 If-Match，旧 revision 返回 409；状态未变且 revision 匹配时不递增授权或 bootstrap revision。删除最后一条有效授权后不再下发该 MCP，重叠授权仍按并集生效；删除后可解除对应用户组的引用保护。Console 提供启用/停用和确认删除，写入失败刷新列表并显示错误，不自动重放冲突请求。
没有 Server 侧 MCP tools/call 代理或带用户密钥的测试 API；JSON 表单保存本身就是配置校验。

### 6.2 Runtime assignment 切片

`GET /enterprise/api/v1/mcp/assignments` → 200 `McpSnapshotResponse`，语义上属于 bootstrap，单独取用。

```json
{
  "data": {
    "schemaVersion": 1,
    "revision": 42,
    "validForMs": 60000,
    "assignments": [{
      "id":"12",
      "revision":7,
      "serverName":"github",
      "displayName":"GitHub",
      "description":"工作事项",
      "transport":"streamable-http",
      "url":"https://mcp.example.com/mcp",
      "allowInsecureTransport":false,
      "headers":{},
      "auth":{"type":"api-key","headerName":"Authorization"},
      "toolCallTimeoutMs":60000,
      "reconnect":{"enabled":true,"initialDelayMs":500,"maxDelayMs":30000,"maxAttempts":10},
      "presentation":"search",
        }]
  },
  "requestId":"req_01ARZ3NDEKTSV4RRFFQ69G5FAV"
}
```

assignment.id 就是 server.id，不用 grant.id：重叠 grant 不能建立多份连接。切片只含有效授权服务器，无 status/enabled/requiredConnection 同义字段。空列表是有效快照；不能把请求失败转为 `[]`。
有效期从客户端发送请求前的单调时钟开始计，不信任客户端系统时间；Server 返回固定 60000，Host 上限同值。超时 10 秒；过期就拒绝新 MCP 调用，旧缓存可展示但不能授权。
无条件返回 200（不实现 ETag/304），每次刷新都重新验证 ACTIVE 用户/设备。复用全局 revision，不另造 mcpRevision。

兼容：原 `/bootstrap` 响应保持原字段。新 Host 登录成功或显式刷新后取切片；旧 Server 的精确 404 表示 MCP_UNSUPPORTED；401/403/503/格式错误不能误判功能未启用。升级 Server 不会使旧客户端 `.strict()` 解析失败。

### 6.3 Runtime 目录和遥测

| Endpoint（/enterprise/api/v1 前缀） | 输入 / 输出 |
|---|---|
| PUT /mcp/servers/{id}/catalog | `{serverRevision,catalogDigest,observedAt,tools:[CandidateTool]}` → `{catalogId,catalogDigest,receivedAt}` |
| POST /mcp/events | `{events:[McpClientEvent]}` ≤50 / ≤64 KiB → `{acceptedEventIds:UUID[]}` |

目录上报要求当前 server 有效授权，serverRevision 相同，全部 canonical hash 一致；整批失败不部分保存。上报是复制当前状态，重复同 digest 返回同候选，不新增审计。
Host 首次成功连接或目录内容改变才上报，按 server 合并，至少间隔 30 秒；超时不影响本地已缓存目录；失败保留一份内存 pending，在下次用户活动重试，不建立后台常驻上传任务。
McpClientEvent 的字段和信任边界见运行时文档。无 runtime 任意工具执行 HTTP endpoint。

### 6.4 HTTP 错误语义

通用 ENT_INVALID_REQUEST=400、ENT_RESOURCE_NOT_FOUND=404、ENT_PERMISSION_DENIED=403、现有 revision conflict=409、413 body 太大、401平台认证、503不可用保持原协议。
新增稳定码统一进现有 OpenAPI 错误枚举/Java 映射/Zod/fixture，不能只在浏览器写字符串：

| code | HTTP | 含义/用户动作 |
|---|---|---|
| ENT_MCP_CONFLICT | 409 | serverName 重复或命名空间被占用 |
| ENT_MCP_CATALOG_STALE | 409 | 目录属于旧配置；刷新并重新选择 |

| ENT_MCP_UNSUPPORTED | 422 | transport/auth/运行时能力不支持 |

OAuth/连接阶段的错误是本地状态码，不能让 Server 编造用户认证失败。local API 的 HTTP 映射见运行时文档。

## 7. RBAC、页面与用户操作

保留现有五角色，不新增 mcp_admin。新增 `ent:mcp:read/write/grant` 三个权限码并使用现有迁移 seed 机制：

| 角色 | read | write | grant |
|---|---|---|---|
| enterprise_admin | 是 | 是 | 是 |
| auditor | 是 | 否 | 否 |
| model_admin / plugin_admin / employee | 否 | 否 | 否 |

MCP 用户消费由 assignment 决定，与管理角色无关。以后给 plugin_admin 管理权属于产品权限变更，不能顺手放开。
`/plugins` 与 `/mcp` 使用独立路由和导航入口，沿用控制台的固定角色导航机制；页面数据读取分别受 `ent:plugin:read` 与 `ent:mcp:read` 约束。MCP 页的“服务配置 / 访问授权”tab 都可只读浏览，配置写操作要求 `ent:mcp:write`，授权操作要求 `ent:mcp:grant`；MCP 页不发插件 API。候选目录/授权成员选择复用现有成员与用户组 selector 和权限入口，不绕过目录权限。

管理表单：连接字段、认证字段条件表单、运行参数、search/full；默认收起高级参数；不显示 `Cordis` 等实现词。服务行提供与模型页一致的铅笔编辑入口，创建和编辑复用弹窗；编辑回填已有值，按原 revision 发送 If-Match，保留未修改的固定 headers、连接参数和独立 OAuth resource。失败保留草稿，revision 冲突要求重新打开最新配置后提交，不自动重放写请求。目录只作为运行诊断信息展示。
表单占位提示使用通用字段含义或格式示例，不使用具体 MCP 厂商名称、专属请求头或固定版本号。
服务启用与用户授权分开；MCP 工具是否需要单次确认沿用 Harness 的工具安全策略。

端侧 UI 的 connected 与 enabled 不是一个开关：连接保存个人授权；“禁用”停止本机使用并保留凭据，“启用”使用已有凭据恢复；“断开连接”清除本机凭据，但管理员下发的 MCP 行仍在列表中。客户端不提供删除服务配置。工具数量可点击展开名称与简介，仅浏览当前目录，不将工具加载进对话；完整状态和本地路由在运行时文档。

## 8. 安全、审计与兼容边界

- Server 不主动连接用户 MCP URL，避免新增平台 SSRF 出站面；候选目录只解析受限 JSON。
- 本机 HTTP 表单输入 API Key 时浏览器短暂持有用户输入，这是不可避免的写入路径；提交后清空、无 localStorage/回显。OAuth token 永不到浏览器。这修正了“浏览器绝不持有任何 Key”的不准确表述。
- credentials provider 是存储接缝，不等于 OS Keychain；实现可能是受权限保护的文件。部署说明披露 provider，不能宣称默认硬件级加密。
- tool metadata/结果都是不可信数据。截断、格式转义、来源标记能降低风险，不能保证消除 prompt injection；执行边界由端侧 guard 与 MCP 协议承担，管理端不维护 Tool 审批。
- 目录/日志不上报 token、参数、结果，也不记录低熵数据 digest 来冒充脱敏。仅 schema 摘要用于定义准入。
- 管理变更审计与 DB 同事务；端侧调用审计 CLIENT_REPORTED，不能作为不可抵赖证据。
- 用户/设备注销、成员停用、Server 地址切换会终止本地连接；在途远端副作用不能靠取消撤回。
- 授权缓存/本机 token 都不共享给另一账号。多用户 Host 不在本版本支持范围，不能仅靠过滤提示词隔离用户。
- 已挂载其他第三方 MCP manager 占用相同 namespace 或重写相同 `tools:sdk` 时停止受管 MCP 呈现并提示冲突；不能静默接管。

## 9. 开发完成的定义

字段、API、状态机、默认值和任务已经给定，但实际开发仍必须证明官方接缝可用。
以 [mcp-implementation-plan.md](mcp-implementation-plan.md) 的门禁/验收矩阵作为完成条件；本文件不声称功能已经运行，也不保证覆盖未来每一种非标准 MCP/OAuth provider。
关键验证失败时先修设计或升级官方接缝，不能把未经验证的假设藏入 UI。当前需要验证的事项均列为 P2-MCP-00，有失败后的处理路径。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
