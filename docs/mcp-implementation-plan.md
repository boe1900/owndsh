<!--
[INPUT]: 依赖 MCP 公共契约、端侧运行时详细设计、现有代码地图和 scripts/mcp-design-spike.mjs。
[OUTPUT]: 提供可按顺序执行的开发任务、文件职责、验收用例、发布/回滚与当前证据状态。
[POS]: docs 的 MCP 实施检查表；明确哪些已经验证、哪些必须由实现补齐，不把规划当完成记录。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# MCP 开发任务与验收

先读 [公共契约](mcp-management-design.md)，再读 [运行时规格](mcp-runtime-design.md)。本文件按依赖顺序直接开工；MCP transport/resources/OAuth 均以官方 Harness 与 MCP SDK v2 为唯一实现真源。

2026-09-22 alpha.2 Web 验收：9 组真实浏览器/AgentLoop 场景通过，MCP/bundle 35 条与 UI 33 条回归通过。修复重复 resources row、补齐 SDK discovery state 回调绑定；MCP 尚未上线，不保留旧开发版凭据兼容。详见 [本轮证据与边界](mcp-alpha2-web-e2e-20260922.md)，下方早期“401 不重放”记录不代表 SDK v2 当前行为。

## 1. 需求与实现闭环

| ID | 要交付的行为 | 规格位置 | 必过验收 |
|---|---|---|---|
| R01 | 管理端公共配置、用户独立凭据 | 公共4/端侧2 | C01、S01、H04 |
| R02 | none/API Key/OAuth 真正连接 | 公共4.2/端侧5 | H01、O01-O12 |
| R03 | 用户/组/全员授予与撤销 | 公共5/端侧3 | S02-S05、H07 |
| R04 | 不把全部schema塞给模型 | 端侧6/7 | P01-P09 |
| R05 | 不改preset、不fork Harness | 端侧1/7 | G01-G04 |
| R06 | SDK 刷新/401 重试与并发关闭隔离 | 端侧4/5.4 | H05-H10、O05-O08 |
| R07 | 操作UI、错误与重试可理解 | 公共7/端侧9 | U01-U07 |
| R08 | 企业兼容与增量发布 | 公共6.2 | C02、D01-D04 |
| R09 | 目录改变不自动扩大能力 | 公共5.3/端侧6 | S06、P06、H03 |
| R10 | 权限执行、秘密与遥测边界 | 公共8/端侧8/10 | S07、H04、A01-A04 |

## 2. 代码落点与复用地图

读取目标目录 CLAUDE.md 再修改；所有新业务文件写 L3 并维护该目录 L2。新增顶级模块才更新 L1，本轮设计没有新增业务模块。

发布边界先冻结：整个企业员工侧能力只有一个用户可安装的 `owndsh-plugin`，MCP 不拆成第二个插件。`mcp-runtime` 若拆成 workspace package，只是 bundle 的内部实现单元；不得新增独立插件 manifest、Loader row、市场入口或额外安装步骤。组织级 Console 是同一产品的服务端控制面，不是额外插件。

| 层 | 现有入口（相对仓库根） | 复用/改动 |
|---|---|---|
| 协议 | contracts/enterprise-openapi.yaml、components/、paths/ | 新增 mcp.yaml schema/path 分片，沿用 envelope/Revision/Cursor/ID/error |
| 生成 | plugin/packages/contracts | 同一 OpenAPI 生成 DTO/Zod/JSON Schema；禁止手改生成物 |
| 平台请求 | plugin/packages/platform-client/src/platform-service.ts | 复用 request/subscribe/refresh；不把 MCP endpoint Bearer 发往外部URL |
| MCP OAuth 宿主 | plugin/packages/bundle/src/mcp-oauth.ts、platform-client 的 browser/loopback | 只提供官方 SDK v2 的 credential/state 记录、系统浏览器和 loopback callback；协议 discovery/PKCE/token exchange/refresh 不在 OwnDsh 实现 |
| 凭据 | platform-client/src/platform-credentials.ts | 借鉴 modifyRecord/generation 的已有规范；MCP grant 独立绑定 owner/target，不修改平台 grant payload |
| bundle | plugin/packages/bundle/src/index.ts、package.json、scripts/build.mjs | 组合 MCP、SDK dependencies 与官方 peers；不安装第二份 Cordis/tools 单例 |
| 端侧UI | plugin/packages/ui/src/account-store.ts、account-view.tsx、local-api.ts | 增加 MCP tab/DTO/短时动作查询，复用现有UI tokens、门禁与重试 |
| 管理UI | console/src/routes/_console.mcp.tsx、features/plugins/mcp-management-page.tsx | 独立 `/mcp` 一级菜单，标题右侧切换服务配置/访问授权；复用 SegmentedControl、ProductDataTable、ProductDialog 与 query/generated HTTP，插件/MCP 路由各自判权 |
| 身份 | server/.../enterprise/auth/application/MemberManagementService.java | 固定五角色继续使用；不新增 mcp_admin |
| 授权模式 | server/.../enterprise/model/application/EffectiveModelResolver.java | 复用成员/组主体解析思路，MCP resolver独立职责，不修改模型允许规则 |
| revision | server/.../enterprise/revision/BootstrapRevisionService.java | 所有MCP配置/授权写事务推进同一tenant revision |
| 鉴权 | server/.../enterprise/device/application/DeviceService.java | runtime每次 requireActive；用户/tenant取现有安全上下文 |
| 审计 | server/.../enterprise/audit/ | 新 action/metadata白名单；端侧事件单独标CLIENT_REPORTED |
| 迁移 | server/owndsh-modules/owndsh-enterprise/src/main/resources/db/migration/ | 下一可用版本，新表/索引/权限种子；禁止重写已发迁移 |

`server/...` 指 `server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh`。

端侧内部 `mcp-runtime` 最小成员职责（不是独立插件）：

- index.ts：公开 runtime 入口与类型出口。
- runtime.ts：assignment reconcile、fiber生命周期、lease和owner generation。
- credentials.ts：MCP凭据payload与 owner/target 绑定。
- oauth.ts：官方 SDK v2 OAuthClientProvider 宿主接缝、callback 事务与凭据适配；不复制 OAuth 协议。
- tools.ts：目录、摘要、search/hot/SDK/guard/hooks。
- local-api.ts：同源UI动作/状态投影。
- types.ts：本地状态与错误码；平台DTO从contracts引用。

这是职责建议，不要求为空文件先建架子；实现时单文件超过800行按职责拆。服务端沿既有 domain/application/persistence/web 布局新增 mcp 纵向目录，不复制整个model模块。

## 3. P2-MCP-00：接缝验证与版本门禁

输出：可运行的官方运行树验证、有限证据记录、必要的设计纠错。业务实现依赖此阶段，文档和schema工作可先进行。

| 验证点 | 精确实验 | 失败处理 |
|---|---|---|
| 目标依赖 | 安装官方 `0.1.6-alpha.2` tools/system-prompt/mcp-client/mcp-resources/ptc-runtime 与 MCP SDK v2；按 public API 加载 | 修正依赖/升级官方兼容版本，更新版本证据；不 vendor 旧源码 |
| 双呈现 | 运行已有 design-spike，捕获native/PTC/both的schema+SDK | 使用官方renderer；若接口变化先修适配，不关闭PTC或发全量 |
| 官方MCP挂载 | 一个SDK测试HTTP MCP提供echo工具，独立fiber activate/dispose/remount同名 | 使用正式Cordis effect生命周期，不读private registry |
| 初次失败隔离 | failOnStartupError=true的child激活失败，平台bundle仍READY | 调整child任务归属与错误contain，不全局吞异常 |
| 目录行为 | tools/list_changed后相同schema、新增、删除、冲突 | 按全代替注册处理，不能依赖未变化definition对象身份 |
| SDK安全 | 描述含 `{{x}}`/反引号/注释结束符，最后 assembly 正常且未变指令模板 | 适配 alpha.2 的 `tools:sdk` 非插值 section，直接写入官方 renderer 结果 |
| 调用生命周期 | pre-execute刷新后同名重挂载，执行仍走当前官方definition与output schema | 若不支持，当前调用拒绝并提示下次重试；不得执行已dispose闭包 |
| Host local权限 | 真实Web/Desktop跨站、无Origin、恶意Host头请求秘密写接口 | 收紧现有authenticated Client路由；未解决不发布远程Host OAuth |
| callback | 本机随机 loopback 完成一次假 provider 流程；OAuth provider 必须接受 `http://127.0.0.1:<port>/callback` | 不兼容 provider 标为不支持并给配置修正；不引入公网 callback 或让用户配置域名 |

现有设计探针是 `scripts/mcp-design-spike.mjs`，无网络/LLM/MCP服务调用，只验证真实tools/systemPrompt接缝：

```sh
node scripts/mcp-design-spike.mjs /absolute/path/to/built/deepseek-harness
```

也接受安装官方 npm packages 的目录（有package.json和node_modules）。必要包：tools、system-prompt、ptc-runtime、Cordis；版本必须同目标运行树一致。
它不执行PTC程序，只验证生成SDK；不验证真实OAuth、远端取消、HTTP重放、管理Server和UI。

## 4. P2-MCP-01：契约、表、授权与候选目录

前置：00已确认版本/public API，公共文档字段冻结。

1. contracts新增McpServerCreate/Update/View、Auth三分支、Grant、Candidate、McpSnapshot、ClientEvent以及完整envelope。
2. 新增paths和稳定错误码，沿现有代码生成器刷新TS/Zod/JSON Schema/console client。
3. 新迁移建server/grant/candidate表，复合tenant约束与部分唯一索引；新增read/write/grant seed给enterprise_admin，read给auditor。
4. 实现McpServerService/GrantService/EffectiveMcpResolver/CatalogService和JDBC实现；不改变原/bootstrap JSON。
5. 管理CRUD/CAS/准入接口、runtime snapshot/candidate endpoint；目录不执行任何网络请求。
6. 配置/授权写入和revision/audit同事务；目录上报摘要校验、去重/retention。

完成标准：C01-C04、S01-S08。新Server+老客户端bootstrap fixture必须仍通过；没有OAuth也能使用none/API Key的配置数据。

## 5. P2-MCP-02：端侧连接与平台失效

前置：01提供assignment/candidate真实endpoint。

1. 新mcp-runtime包，平台READY订阅、单flight snapshot、60秒lease与generation。
2. 用户settings连接意愿；Key专用credential payload；独立child fiber挂载官方client。
3. 统一tools准入predicate/guard、目录snapshot；在发布可执行MCP前先装guard和presentation，杜绝启动期间全量暴露窗口。
4. assignment差异处理、首次失败隔离、掉线/停用/退出、timeout/drain/cleanup。
5. 同源local API支持connect/pause/disconnect/reconnect，先用无UI HTTP测试链路。
6. candidate 目录仅用于诊断；Tool 能力由端侧动态发现和 Host 安全策略决定。

完成标准：H01-H10；在任意异常路径不得把假成功状态或原始秘密传给UI。

## 6. P2-MCP-03：搜索、会话隔离与真实模型请求

前置：02已能安全连接注册。此阶段是第一版必需项，不后置到“规模大了再做”。

1. 端侧 Tool metadata 采用稳定 canonical 结构；目录仅用于诊断。
2. search工具：输入验证、Unicode/英文拆词、名称/描述权重、稳定排序；返回compact metadata。
3. WeakMap<Agent,LoadedSet>去重累加，mcp_tool_release显式释放；presented固定本步调用许可，删除16工具/64KiB及LRU。
4. 修改assembly.tools并以官方renderer替换tools:sdk，保留run_code及非受管工具与PTC-only指导。
5. 现有scope restrict交集、session/fork/resume冷启动、撤权/变更移出hot。
6. 真实LLM适配器的捕获服务断言wire payload，而不只测试中间数组。

完成标准：P01-P09、G01-G04。新对话无冷schema；search后一轮能调用；代码模式执行非MCP工具仍工作。

## 7. P2-MCP-04：OAuth

前置：02生命周期可用，03对schema变化能收敛。

1. 使用官方 `@modelcontextprotocol/client@2.0.0` 的 `auth()`、`StreamableHTTPClientTransport` 和 `OAuthClientProvider`，OwnDsh 不实现 discovery、PKCE、token exchange 或 refresh。
2. OwnDsh 只提供 owner/target 绑定的官方 client information/tokens 记录、SDK verifier 短生命周期存储、系统浏览器与本机 loopback callback。
3. MCP `Client` 使用官方协议协商、tools/resources/resources-templates 分页和零工具服务器能力；资源转交官方 `dsh-mcp-resources`。
4. 连接与重授权仍受 assignment revision、平台状态、AbortSignal 和 fiber 生命周期门禁；失效凭据由官方 auth/transport 触发重新授权。
5. API Key 仍只交给官方 dsh-mcp-client；OAuth 不在 OwnDsh 预先拼接 Bearer 或维护第二套 token 计时器。
6. 仅验证宿主接缝和官方 SDK 行为，不复制官方 discovery/PKCE/token/refresh 测试矩阵。

完成标准：O01-O12。使用本地受控TLS OAuth fixture，不需要真实用户秘密；发布前再用一个受支持的真实provider人工确认。

## 8. P2-MCP-05：管理UI、用户UI与审计

1. 独立 `/mcp` 页面：标题右侧“服务配置 / 访问授权”双 tab，每次只展示一张表格，搜索/筛选状态不跨表混用；配置和授权使用统一弹窗，按 read/write/grant 控制操作入口，凭据边界说明放在表格下方。
2. 全员/成员/用户组授权并集去重的展示；显示“可连接，工具由端侧动态发现”。
3. OwnDsh 设置 MCP tab：连接/暂停/清理/重连、OAuth 进度、目录与发现状态；它属于现有 `owndsh-plugin` 的 Settings UI，不新增插件包或顶级 sidebar 入口。
4. 既有Query/local-api/store模式，账号切换清除旧请求；操作临时查询有截止时间。
5. audit metadata、CLIENT_REPORTED遥测、限量去重及retention；secret扫描。
6. 文案、键盘焦点、dialog Escape和窄屏；不开新的宿主sidebar入口。

完成标准：U01-U07、A01-A04；所有role×tab均测“既不显示也不请求”。

## 9. P2-MCP-06：发布、回归与恢复

1. 正式tarball consumer测试，官方依赖只加载一份，Host与Client构建互不污染。
2. 目标Harness Web真实组合，完成下列矩阵，记录provider与精确版本；Desktop 不属于本项目发布运行面。
3. 无额外手工cordis.patch步骤，新安装从Server登录到MCP授权可用。
4. 新/老Server与新/老插件四象限兼容、撤权、同名冲突、离线重启。
5. 管理员停用所有MCP即业务回滚；恢复旧bundle不应删除官方用户凭据；本地新MCP记录保留隔离但不可被旧代码解释成平台grant。
6. DB迁移只前滚，回滚应用不删MCP表。停用后服务元数据、准入和审计可追溯；未使用的候选按retention清理。

完成标准：D01-D04与全部E2E；以后stdio/组织proxy单开任务，不阻塞已经定义的第一版。

## 10. 验收矩阵

每条必须有输入、可观察结果和失败断言；同一测试可以覆盖多条。不要求重复写同实现的镜像测试。

### 10.1 Contracts / Server

| ID | 输入/故障 | 必须观察到 |
|---|---|---|
| C01 | 请求未知字段、raw token、非法auth分支、header CRLF | 400/严格decoder拒绝；response无secret席位 |
| C02 | 老/bootstrap fixture + 新MCP endpoint | 旧client仍解析成功，MCP仅新client请求 |
| C03 | ID溢出、非有限revision、非法scope、巨大schema | 边界拒绝，Java/TS同结果 |
| C04 | JCS不同key顺序/Unicode/输出schema/description变化 | 等价定义hash相同，定义变化hash不同 |
| S01 | A租户对B server/grant/candidate操作 | 404或明确403，无跨租户写/信息泄露 |
| S02 | 三种主体同时授权同server | snapshot一份assignment；删除一条仍有有效授权 |
| S03 | 成员进出用户组、LDAP映射导入 | 有效授权与全局revision同步改变 |
| S04 | 相同CAS并发更新、同幂等key不同body | 一次成功、另一次409；不产生半条grant/重复审计 |
| S05 | member/device停用、server disable | 新snapshot拒绝/移除；旧lease不再续期 |
| S06 | CLIENT_REPORTED候选、未知hash、stale serverRevision | 不改变执行权限；错 revision 仍 409 |
| S07 | 伪装tenantId/userId/deviceId、事件重放 | 身份字段拒绝；服务端绑定当前身份；eventId去重 |
| S08 | 大批catalog与过期候选 | 单次大小/数目上限、20份/服务与7天清理落实 |

### 10.2 Host / lifecycle

| ID | 输入/故障 | 必须观察到 |
|---|---|---|
| H01 | SDK测试MCP none/Key，合法零工具 | activate完成才READY，0工具不误报离线 |
| H02 | 登录时多个server、一台拒连 | 平台登录正常，其他server可用，失败实例无残留namespace |
| H03 | tools/list_changed：同schema重排/新增/删除/冲突 | hot按摘要保留/移除；按端侧动态发现结果处理；冲突无半套注册 |
| H04 | Key输入、保存、重启、断开、存储失败 | Key不在state/bootstrap/log/Session；失败不假成功 |
| H05 | 两会话同时refresh/reconnect | 同server只一次refresh与remount，其他server不阻塞 |
| H06 | refresh/dispose与在途写工具竞争 | 没有重复tools/call；取消后可能UNKNOWN_OUTCOME；无重叠namespace |
| H07 | t0撤权、t0+60秒新调用、平台断网 | 旧lease最多60秒，过期fail closed；模型普通工具可继续 |
| H08 | 退出/切账号过程中旧response迟到 | 旧token/目录/flow不能复活，无跨账号key复用 |
| H09 | provider重连耗尽、dispose不settle | DEGRADED/CLEANUP_REQUIRED，明确人工恢复，不挂第二个实例 |
| H10 | schema 刷新交错 | lookup/guard/呈现一致；暂态不可用而非调用旧定义 |

### 10.3 OAuth

| ID | 输入/故障 | 必须观察到 |
|---|---|---|
| O01 | manual public client + PKCE S256 | 用户浏览器授权，Host换token，MCP收到正确Authorization |
| O02 | PRM多个AS、issuer不匹配、metadata重定向 | 只选配置issuer，拒绝不受信任跳转/降级 |
| O03 | 显式dynamic、注册需要client_secret | public DCR可用；confidential明确不支持 |
| O04 | wrong/reused/expired state、重复callback | 错state不消费合法flow；成功code只交换一次 |
| O05 | refresh rotation有新token/无新token | 原子替换或保留refresh token，access token不持久化 |
| O06 | token交换响应丢失、invalid_grant | 不无限重试一次性code/refresh；要求重新授权 |
| O07 | 短TTL与expires_in缺失、无refreshToken | 不陷刷新循环；未知expiry不猜JWT；无refresh重启需授权 |
| O08 | tools/call收到401或未知网络失败 | 不自动重放，失败只含脱敏分类，可手动重授权 |
| O09 | scope越界、resource不匹配、PKCE plain | 拒绝，不在UI假装连接成功 |
| O10 | owner切换/撤权/关闭窗口期间OAuth完成 | 旧事务取消，迟到token不得写入新owner |
| O11 | Desktop本机/本机Web/固定公开Host callback | 完整redirect一致，远程浏览器不误跳到浏览器机器loopback |
| O12 | 扫描callback/log/UI/Session/Server中的受控假token | 除预期credentials/内存/出站Authorization之外零泄露 |

### 10.4 Presentation / 实际请求

| ID | 输入/故障 | 必须观察到 |
|---|---|---|
| P01 | 连接含100个工具，新agent | 冷启动请求仅search/release控制工具，没有100个schema |
| P02 | search命中5个 | 下一次推理仅加载5个；search返回不重复带完整schema |
| P03 | A会话热5个，B会话冷 | B请求无A的schema，连接实例不重复建立 |
| P04 | native/ptc/both × TS/Python renderer | wire schema和SDK均过滤，run_code与非MCP能力保留 |
| P05 | 中文查询、alias、无结果、server过滤 | 不退成前N项；stable排序；不泄露未授权工具名 |
| P06 | hot工具撤权/摘要改变/远端删除 | 后续请求移除，旧历史name调用被guard拒绝 |
| P07 | 多次搜索累计24个/超过64KiB/多个full服务/显式释放 | 无隐式淘汰或降级；去重累加，释放仅下步生效、可重搜、full不释放 |
| P08 | description含HTML、NUL、`{{x}}`、代码围栏 | 无DOM执行、无模板变量注入、工具结构未被错误截断 |
| P09 | 宿主重新组装请求、工具代次变化、其他 manager 改写 hook | OwnDsh 按当前授权和 Agent 热集合投影工具，不泄漏冷工具；不支持的呈现组合明确拒绝。Harness 压缩算法本身不属于本项验收 |
| G01 | 实际standard/minimal及自定义restrict preset | 与Harness scope规则一致，broker不能绕过restrict |
| G02 | 源码checkout只读、用户profile/patch记录比较 | 无上游修改、无MCP配置写入用户preset/cordis.patch |
| G03 | fork/resume/子agent | 各自冷hot集合，工具能力不从别用户继承 |
| G04 | 现有structured output、普通工具、审批ask/deny | 原有协议与gate没有被presentation破坏 |

### 10.5 UI / 审计 / 发布

| ID | 场景 | 必须观察到 |
|---|---|---|
| U01 | enterprise_admin/auditor/其他三角色访问 `/mcp` 与服务配置/访问授权 tab | 按read/write/grant裁剪，非授权不发请求；Tab 切换仅显示当前表格和操作入口 |
| U02 | none/API Key/OAuth条件表单 | 只提交所属分支字段，HTTP/OAuth限制准确显示 |
| U03 | 空授权/目录变化 | 管理员和员工能区分可连接与当前可用能力 |
| U04 | connect/pause/disconnect/reconnect/cancel | 操作对齐状态机，无相反操作互相覆盖 |
| U05 | 账号切换与旧请求迟到 | 原有store代次隔离，无信息串号 |
| U06 | OAuth等待/关闭设置/超时 | 临时查询终止，无永久轮询/不可取消spinner |
| U07 | 键盘/窄屏/屏幕阅读器 | dialog焦点与错误说明正常，无不可访问按钮 |
| A01 | 同步DB失败/审计失败 | 管理写事务整体回滚，无未审计权限变更 |
| A02 | 端侧伪造成功调用事件 | 标CLIENT_REPORTED，不能变成可信授权/计费事实 |
| A03 | 断网队列200项/重发相同event | 丢弃计数可见、上报有界、Server去重 |
| A04 | 非预期OAuth/tool错误包含假secret | 不记录原始异常正文；错误输出没有token |
| D01 | 新Server+旧插件 | 原bootstrap不变，平台功能正常 |
| D02 | 旧Server+新插件 | 精确404显示MCP不支持；普通平台功能正常 |
| D03 | 新Server+新插件+目标Harness Web | 完整用户闭环，不需要手改profile |
| D04 | 全部MCP停用、插件回滚、DB前滚保留 | 不再调用MCP，旧平台功能可运行，审计/配置未丢失 |

## 11. 验证命令与证据格式

已存在可直接运行：

```sh
node scripts/mcp-design-spike.mjs /absolute/path/to/built/deepseek-harness
node --check scripts/mcp-design-spike.mjs
```

契约实现后沿用：`pnpm --dir plugin --filter @owndsh/contracts generate` 与 `check:generated`；console沿现有generate-openapi入口。业务测试随对应文件建立后加入各package既有test，不建独立测试框架。
Server按当前Maven父项目/test容器流程运行集成用例；Host使用现有Vitest与正式tarball consumer；UI沿现有测试工具与真实浏览器验收。完整流程命令应由实现任务写入相应package.json，而不是在设计中写一个现在不存在的 npm script。

每次证据记录包含：日期、OwnDsh commit、Harness npm版本与commit、SDK版本、运行面/OS、用例ID、命令、结果、有限制的事实。禁止记录真实token、完整用户工具输入/输出。

## 12. 当前证据与未完成事项

| 检查 | 当前状态 |
|---|---|
| Harness `0.1.6-alpha.2` 兼容性 | 已适配：`codeRuntime`→`ptcRuntime`、PTC `session.header`、alpha.2 非插值 `tools:sdk` section |
| 官方 SDK v2 OAuth 宿主接缝 | 已通过：官方 discovery/PKCE/token exchange、issuer/iss、loopback browser callback 与 token/client information 记录委托；OwnDsh 不实现协议 |
| 官方 client/resources HTTP 接缝 | 已通过：本地 Streamable HTTP fixture；协议协商、tools/list 分页、resources/list、resource templates/read、instructions、OAuth Authorization 与 tools/call |
| OAuth/并发 remount/撤销生命周期 | 真实 HTTP MCP 已验证发现、重挂载、撤回、凭据目标/账号隔离；受控 token 响应已覆盖 rotation、过期更新和 refresh/disconnect/账号切换/dispose 竞争；真实 OAuth provider 与在途工具调用竞争仍待验证 |
| 管理Server/API/迁移/前后端页面 | Console 支持公共配置创建/启停、ALL/USER/GROUP 授权创建/启停/删除、按权限显示 Tab；Server 支持主体校验、组展开、原子批量创建、cursor 列表和授权 CAS。创建与授权批量已完成数据库幂等重放和脱敏管理审计 |
| 真实provider+Web E2E | 既有 Apifox/Notion 证据仍保留；本轮新增官方 SDK v2 本地闭环。Desktop 不列入本项目发布门禁，第三方 provider 的业务差异仍需单独验证 |

“可直接开发”指主要产品与技术决策、协议、失败分支和验收责任已经清晰；不意味着能跳过00阶段或保证未来每个MCP服务实现都兼容。设计中发现的新事实必须回写三份文档；不能只在代码里加一条未记录的例外。

2026-09-14 探针运行：Node24.14.1，本机历史checkout与隔离npm运行树分别执行同一设计脚本，六种模式组合均通过；目标 npm 运行树固定 `dsh-tools/system-prompt/code-runtime/dsh-mcp-client@0.1.5-rc.2`、Cordis4.0.2，并通过独立本地 Streamable HTTP fixture 验证真实发现、静态 Authorization、调用结果与启动失败隔离。每次创建独立Cordis上下文并清理，使用最小agent标识与假的CodeRuntime，未执行PTC代码/LLM/外部MCP。目标依赖安装禁用lifecycle scripts，未修改项目node_modules或依赖锁。实际OAuth、PTC执行和完整Session生命周期仍由G03/G04/O01-O12验收。

2026-09-14 P2-MCP-03 当前核查：bundle 仅挂载 `presentation=full` 的 MCP。移除 Tool 审批后，搜索目录尚未接到真实连接发现，`presentation=search` 目前不可用；per-Agent schema 呈现、预算控制和执行边界仍待完成，不能将早期搜索片段视为已交付功能。
2026-09-14 P2-MCP-04 首个切片：新增 `McpOAuthTokenManager`，OAuth grant 仅存 Harness credentials，access token 提前 30 秒判定过期，refresh 使用 single-flight 并支持 refresh token rotation；缺少 token 的 OAuth MCP 不启动连接。新增本地 `/enterprise/api/v1/local/mcp/oauth/start`、`/status`、`/cancel`：start 返回 flowId，流程状态为 PENDING → SUCCEEDED/FAILED/CANCELLED，五分钟 PKCE loopback 窗口可取消，失败仅返回固定 `OAUTH_FAILED` 不泄露远端错误。token 过期后的连接 remount、Settings 状态查询 UI 和真实 OAuth fixture 仍待接入。
2026-09-14 P2-MCP-05 首个切片：Console `/plugins` 改为插件/MCP 双 tab；MCP tab 使用生成 SDK 展示 Server 状态，并提供 none/API Key/OAuth 公共字段创建与 If-Match 启停。API Key 值和 OAuth token 不进入管理端；Settings MCP tab、授权主体 UI 仍待实现。
2026-09-14 P2-MCP-05 第二个切片：bundle 新增脱敏 `/enterprise/api/v1/local/mcp/status`；OwnDsh Settings 增加 MCP tab，展示 assignment 的认证类型/连接状态，并通过本地 start OAuth 路由启动用户授权。用户 API Key/OAuth token 仍只留在端侧凭据边界。
2026-09-14 P2-MCP-05 第三个切片：Settings 支持用户输入 API Key、连接/断开；bundle 通过本地 connect/disconnect 写入或删除端侧 credentials，runtime 连接时才生成认证 header。管理端不保存 secret，也不维护 Tool 审批。

2026-09-14 P2-MCP-05 用户组授权切片：Console 完整遍历服务/授权/用户组 cursor，支持 ALL/USER/GROUP 与主体切换清空、目录失败阻止提交和重试；read/write/grant 分权，成员目录请求另受 ent:member:read 限制。HTTP ID 保持字符串，ALL 的 subjectId=null。Server 通过既有 MANUAL/IDENTITY_SOURCE 成员表求授权并集，校验 tenant/主体并对批量写和 bootstrap revision 整体回滚；仍被 MCP 授权引用的组禁止删除。V30/V31 修正已删除字段残留、SQL 占位符、跨租户外键、ALL 重复授权以及权限菜单 ID/内置角色迁移问题。

当前实现边界：端侧已将每个 assignment 挂载到独立官方 dsh-mcp-client Cordis fiber；撤权、停用、配置 revision/生效认证头变化、disconnect 和 Host 销毁都会调用并等待官方 `fiber.dispose()`。MCP client/resources/OAuth 均走 Harness `0.1.6-alpha.2` 与官方 MCP SDK v2：OwnDsh 只负责 owner/binding 凭据隔离、官方 client information/tokens 与短生命周期 verifier 存储、系统浏览器和 loopback callback。search 真实发现、per-Agent schema、连接/目录代次 guard、持久连接意愿和 CLEANUP_REQUIRED 均已实现并通过本地回归；Harness Web 主路径与 OAuth 验证事实见后文；后续接缝回归限于 OwnDsh 的工具投影、会话隔离和执行权限，不重复验收 Harness 会话压缩算法。管理端 server/grant 创建使用 PostgreSQL 幂等占位和 JCS 请求摘要，同 key 重放原资源，不同 body 返回 409。

本轮验证（2026-09-14，本机 Node 24.14.1、Java 21、PostgreSQL 17.10）：McpGrantIntegrationTest 3 条、RbacSeedTest 3 条、EnterpriseMigrationTest 7 条均通过；新增 Console MCP 交互测试 6 条和既有插件路由回归 2 条通过。Console、bundle、plugin UI 的 TypeScript 检查和契约生成一致性检查通过。未执行真实 OAuth provider 或 Web/Desktop 端到端验收。

复跑入口：在 `server/` 使用 `./mvnw -q -Pdev -pl owndsh-modules/owndsh-enterprise -am -Dmaven.test.skip=false -Dtest=McpGrantIntegrationTest,RbacSeedTest,EnterpriseMigrationTest -Dsurefire.failIfNoSpecifiedTests=false test`。父 POM 默认跳过测试，必须显式设置 `maven.test.skip=false` 并选用 dev 测试组；仅执行 compile 不构成数据库验证。Console 在 `console/` 使用 `node_modules/.bin/vitest run src/features/plugins/mcp-management-page.test.tsx`，插件路由使用 `node_modules/.bin/vitest run src/routes/-index.test.tsx -t plugin`。

2026-09-15 授权生命周期切片：实现 `PUT/DELETE /enterprise/admin/v1/mcp-grants/{id}`，只接受 ent:mcp:grant，按 tenant 行锁和 If-Match 校验后修改状态或删除。旧 revision 返回 ENT_REVISION_CONFLICT；不存在、外租户和已删除记录统一 404；缺少/负 revision 或非法状态返回 400。noop 不推进版本，成功变更与 bootstrap revision 同事务，失败整体回滚。Console 按 grant 权限展示启用/停用与确认删除，使用列表当前 revision；冲突刷新列表，由用户明确重试，不自动重放。

2026-09-15 端侧连接生命周期切片：核对官方 `@deepseek-ai/dsh-mcp-client@0.1.5-rc.2` 的公开 `apply()`/Cordis fiber disposer；bundle 改为每个 assignment 创建独立子 fiber，按 server revision、URL、公共 headers、reconnect/timeout 与生效 OAuth/API Key header 签名调和。撤权、配置变化、凭据断开和 bundle disposal 均先等待 `fiber.dispose()`，refresh 使用 single-flight，OAuth/API Key 保存后立即触发 reconcile；初次连接失败只隔离到对应 server。bundle typecheck 与 7 条 Vitest 回归通过。

本轮验证：真实 PostgreSQL + MockMvc 的 McpGrantIntegrationTest 共 6 条通过，包含并集回收、CAS 并发胜负、noop、跨租户/重复删除 404、400/409、revision 写入失败回滚及用户组引用释放；Console MCP 交互测试共 9 条通过，包含确认取消、启停/删除的 If-Match 和冲突刷新后重试。Console 类型检查通过；未修改或验证端侧连接生命周期。此前将授权回收描述为完成时仅有协议定义，现以本次实现及测试为完成依据。

2026-09-15 P2-MCP-03 搜索与呈现切片：从 bundle 组合根提取内部 `mcp-runtime.ts` 和 `mcp-tools.ts`，所有 search/full 服务均由官方 client 连接与注册；安装前先保留 namespace/guard，激活后发布真实目录。搜索按 Agent 与官方 scope 限制求交集，支持中文、名称/描述、服务过滤、稳定排序和有界 LRU；同一预算计算同时服务搜索、native schema 与官方 TS/Python SDK。全量配置超预算回退 search，Settings 展示工具数量、实际连接与原因。平台订阅及活动触发刷新替换 30 秒定时轮询；60 秒租约从发送前计时，过期拒绝新调用，旧响应不能在退出后复活连接。

本切片新增 `bundle/tests/mcp-runtime.spec.ts`，覆盖 5 种呈现/语言组合的官方 pi-ai HTTP 请求捕获，以及预算/LRU、scope 限制、无结果/非法查询、结构等价重注册、异步 gate 期间定义变化、租约失效、namespace/SDK 冲突和真实 HTTP MCP 的发现/同名 remount/撤权/退出释放。UI local-api 同步验证新增脱敏字段并拒绝秘密及非法计数。真实 TS/Python 解释器、完整 AgentLoop/compaction/complete prompt/其他 manager 上游改写、真实 OAuth provider 与完整 Web/Desktop E2E 尚未执行；不能把这些本地回归写成 P2-MCP-06 已完成。

本切片最终验证：bundle 完整构建与类型检查通过，bundle 18 条 Vitest（其中 MCP 运行时/呈现 11 条、OAuth 4 条、发布组合 3 条）通过；UI 类型检查与 20 条回归通过；`git diff --check` 通过。复跑：在 `plugin/` 执行 `pnpm --filter owndsh-plugin test`、`pnpm --filter @owndsh/ui exec vitest run tests`；依赖产物就绪后可在 `plugin/packages/bundle/` 执行 `node scripts/build.mjs`，避免重复构建未改动的上游 workspace。依赖版本采用已锁定的官方 0.1.5-rc.2，新增的 system-prompt/code-runtime/scope 为测试与类型依赖，不新增员工安装项。

2026-09-15 P2-MCP-04 凭据隔离与 OAuth 取消切片：两类凭据统一到内部 `McpCredentialManager`，从可信 bootstrap 绑定 platform origin/userId/deviceId/installationId，再与 serverId、URL/transport/headers/auth 的规范化摘要组成 credentials key；显示名与呈现参数不造成凭据丢失。当前 user/device 均为数据库全库主键，无需增加客户端自填 tenant 字段。旧 serverName grant 不迁移，用户升级后重新连接。OAuth access token 仅存内存；refresh 在官方 modifyRecord 原子边界轮换，缺少新 refresh_token 时仅刷新流程保留旧值，新的浏览器授权不会继承旧值。

取消/断开/撤权/换账号/销毁均 abort 相应 manager 或 flow；凭据提交期间取消会比较并回退本次写入，disconnect 等待在途操作后删除，清理失败仍释放连接且不能继续使用旧 manager。平台注销/认证过期/设备撤销清理本身份记录；普通 Host 销毁保留持久 grant。相同 token 延期只更新门禁 expiresAt；新 token 先 dispose 官方 fiber，再重挂载。无连接的 OAuth flow 也检查 assignment revision，撤权不会漏掉授权中的服务。

本切片验证：bundle 26 条 Vitest 通过（OAuth/凭据 9、runtime/呈现 14、发布组合 3），TypeScript 检查通过。OAuth 使用真实本机 loopback callback、受控系统浏览器交接和 mock token 响应，验证 PKCE/state、刷新 single-flight/rotation/invalid_grant、无 refresh token、提交期间取消和迟到写入；真实官方 HTTP MCP 验证改 URL 不发旧 Key、切账号不复用、token 更新与断开/切账号/销毁期间的迟到 refresh。共享 PKCE 原语另补启动前/监听期间取消，避免回调对象交付前产生未处理拒绝；对应 6 条 PKCE 回归通过。bundle 构建与 `git diff --check` 通过。未执行外部 provider、完整 AgentLoop 或 Web/Desktop E2E。

历史计划（已由后续 callback 边界修正取代）：曾考虑远程固定 HTTPS callback；当前实现固定使用端侧 loopback。真实 provider/Web/Desktop E2E 仍是发布前门禁。

2026-09-15 P2-MCP-04 OAuth discovery 切片：bundle 显式声明并 externalize `@modelcontextprotocol/sdk@1.30.0`，使用官方 `discoverOAuthProtectedResourceMetadata` 和 `discoverAuthorizationServerMetadata`。当配置缺少任一 manual endpoint 时，先发现 RFC 9728 PRM，再只接受管理员声明 issuer，校验 resource/issuer 精确匹配、HTTPS/no-redirect、authorization code、PKCE S256、public token endpoint；manual endpoint 仍保持兼容。发现和 metadata 不进入持久凭据。新增 mismatch/redirect/成功 discovery fixture；bundle MCP 28 条测试（含 discovery 2 条）及类型检查通过，构建通过。SDK discovery 不触发第二套 OAuth 状态机，PKCE/state/credentials 仍由 OwnDsh 持有。

2026-09-15 P2-MCP-04 OAuth DCR/resource 切片：动态 registration 显式使用 SDK `registerClient`，提交 loopback redirect 与 `token_endpoint_auth_method:none` 的 public client metadata；响应必须回显唯一 redirect、authorization_code/code 能力且不得包含 client_secret，否则中止授权。动态 clientId 与 refresh token 原子保存到同一受 owner/server/binding 约束的 grant，重启后可由 manager 恢复用于 refresh；预注册 grant 继续兼容。resource 已加入 authorization URL、authorization_code exchange 与 refresh body。contracts 与 Console 表单增加严格 dynamicRegistration 分支，创建 dynamic 配置时省略 clientId。新增持久 clientId/resource wire 测试；bundle 14 条 OAuth 测试、Console 9 条 MCP 测试及类型检查通过。真实 provider E2E 仍未完成。

2026-09-15 P2-MCP-04 callback 边界修正：确认 OAuth callback 属于端侧能力，管理端不配置 `callbackMode`；OwnDsh 当前固定使用本机 loopback，移除 `publicHostOrigin`/远程 callback 路由，避免引入用户无感知的公网域名与反向代理配置。跨机器浏览器授权留待未来云端 callback 方案单独设计。

2026-09-15 P2-MCP-04 端侧连接意愿切片：runtime 注册 `owndsh-mcp` settings 保存按 owner/serverName 绑定的 `desiredConnected`；CONNECT 与 OAuth start 写入 true，DISCONNECT 写入 false 并删除对应端侧凭据，重启后按 settings 跳过已暂停服务。缺少 settings Service 的测试 Host 继续使用内存回退，保持旧 Harness 兼容；完整 CLEANUP_REQUIRED UI/重试和显式 PAUSE API 仍待后续切片。

2026-09-15 P2-MCP-04 PAUSE/RECONNECT 切片：端侧新增 `/mcp/pause` 与 `/mcp/reconnect`，PAUSE 仅撤销 fiber、保留 credential，RECONNECT 恢复 desiredConnected 并强制调和；Settings 显示暂停状态，连接中提供“暂停/断开并移除”，已暂停服务提供“重新连接”。UI 本地 API 与状态解码同步，bundle OAuth/runtime 28 条、UI 20 条回归通过。

2026-09-15 P2-MCP-04 CLEANUP_REQUIRED 切片：DISCONNECT 删除凭据失败时返回固定 `MCP_CLEANUP_REQUIRED`、保留待清理状态并禁止 RECONNECT；状态 API 与 UI 投影待清理，提供“重试清理”，成功删除后才清除状态。Bundle runtime 14 条、UI 20 条回归通过。

2026-09-15 P2-MCP-06 管理幂等切片：新增 V32 `ent_mcp_idempotency`，server 创建与 grant 批量创建在业务事务内先占用 `(tenant, endpoint, UUIDv4)` 并锁定请求 SHA-256 摘要，成功后保存资源 ID；同 key 同摘要重放原资源，不同摘要返回 `ENT_IDEMPOTENCY_CONFLICT`，异常回滚不残留占位，并发请求不会生成重复资源。McpGrantIntegrationTest 增加重放/冲突回归；Java 编译通过。

2026-09-15 P2-MCP-07 管理审计切片：复用既有 `AuditSink`，MCP server/grant 创建、更新、启停和删除均在同一业务事务追加 `CONFIG_CHANGED`；新增 `McpChangeMetadata` 仅允许 operation、resource revision、bootstrap revision、subjectType/subjectId，绝不写入 URL、headers、API Key、OAuth token 或请求体。真实 PostgreSQL + MockMvc 的 McpGrantIntegrationTest 7 条通过，Flyway V32 迁移通过。

2026-09-15 P2-MCP-08 OAuth provider fixture：在 `mcp-oauth.spec.ts` 中增加真实本地 HTTP provider，完整响应 RFC 9728/8414 discovery、RFC 7591 public DCR、authorization-code token exchange 与 refresh rotation；测试通过真实 Node fetch、MCP SDK discovery 和 loopback callback，验证 resource/client_id/redirect 绑定。OAuth 测试 15 条、bundle TypeScript 检查通过；外部真实 provider、Web/Desktop 与完整 AgentLoop 仍是发布前门禁。

2026-09-15 P2-MCP-09 运行时回归：官方 Cordis、dsh-mcp-client、pi-ai、本地 MCP HTTP 服务的 `mcp-runtime.spec.ts` 14 条通过，覆盖五种工具呈现/语言组合、搜索预算/LRU、namespace 与代次 guard、真实发现、OAuth/API Key 重挂载、暂停/重连/断开、撤权和 Host dispose。Desktop E2E 暂不运行：当前环境未设置 `OWNDSH_TEST_RUNTIME`，没有可验证的外部 Desktop 运行树。

2026-09-15 MCP 工具参数诊断：Harness Web 真实会话的 `request/header` 已包含 `mcp__notion__notion-list-recent-pages` 完整 inputSchema，`cursor` 没有出现在 `required`；失败调用由模型自行生成 `undefined`、空串及占位词，Notion 返回 400 `Invalid cursor format`。分页 cursor 是 MCP 服务定义的 opaque 值，服务端拒绝未产生于上一页响应的值属于有效行为；OwnDsh 不为 Notion 添加参数清洗或专属提示补丁。

2026-09-15 MCP Web 验收：同一 Notion OAuth 连接下，`notion-search` 成功执行并返回空结果，`notion-fetch` 使用 `{"id":"self"}` 成功返回工作区与当前用户信息；`notion-ai-search` 返回 Notion 自身的 Business 计划限制。由此确认 OwnDsh 的 MCP 发现、按需加载、OAuth 请求头和具体工具执行链路正常，剩余失败仅限 Notion 分页工具的模型参数/服务能力边界。

2026-09-15 MCP 自主参数验收：新建会话只提出“读取当前 Notion 账号基本信息”，未提供工具名或参数；LLM 自行搜索并加载 `notion-fetch`，生成 `{"id":"self"}` 后成功返回工作区名称和用户类型。该结果证明工具描述与 Schema 已进入模型上下文，模型能够自主完成一次无分页参数的 MCP 调用。

2026-09-15 OwnDsh 核心呈现回归：新增并通过 full 预算内断言（2 个已发现工具全部进入 assembly），同时保留 search 冷启动不带远端工具、搜索后只带热集合、full 超预算退回 search、Agent 隔离、撤权/代次取消和连接生命周期覆盖。`mcp-runtime.spec.ts` 与 `mcp-oauth.spec.ts` 合计 30 条通过；本轮不以 Notion 业务结果作为 OwnDsh 验收条件。

2026-09-15 OAuth 生命周期验收：access token 在剩余 30 秒以内或已过期时，由下一次 assignment 刷新、工具搜索或工具执行前的租约刷新触发 refresh；并发请求共用单 flight，refresh token rotation 原子保存。成功刷新后连接代次重挂载并使用新 Bearer；`invalid_grant` 原子清除失效 grant 并 fail closed，瞬时网络/非 invalid_grant 错误保留 grant 等待重试；disconnect、账号切换和 dispose 会取消 token 请求且不允许迟到响应写回。上述边界由本地真实 HTTP OAuth provider fixture 与官方 MCP runtime 回归覆盖。

2026-09-15 Harness Web 核心呈现验收：使用本地 `fullfixture` Streamable HTTP MCP（`full_read`、`full_status`）验证真实 Web 请求。`full` 冷启动首轮 `request/header.tools` 同时包含两个 fixture 工具，且未先调用 `mcp_tool_search`；用户只给自然语言“读取关于 alpha 的内容”时，LLM 自主生成 `{"topic":"alpha"}`，调用成功并返回 `fixture read alpha`。同一 fixture 切换为 `search` 后，新会话首轮仅投影 `mcp_tool_search`（远端工具 Schema 不进入请求）；在自然语言要求使用外部 MCP 时，LLM 先调用搜索工具，随后只将搜索命中的工具加入后续步骤。进一步将 fixture 切回 `full`，对与 MCP 无关的“解释 TCP 三次握手”请求取证：首轮 Schema 仍包含 `mcp__fullfixture__full_read` 和 `mcp__fullfixture__full_status`，即 `full` 模式下所有直接可用工具会进入每轮模型上下文，即使问题与该 MCP 无关；`search` 模式则不会携带这些远端工具。该结论是 OwnDsh 呈现策略的真实 Web 证据，不包含 Notion 业务验收；当前仍未执行外部 OAuth provider、Desktop 和完整 AgentLoop 发布验收。

2026-09-15 Apifox 远程 API Key Harness Web 验收：核对 Apifox 新版 MCP 文档后使用官方远程 Streamable HTTP 端点 `https://api.apifox.com/mcp`，公共 header 为 `X-Apifox-Api-Version: 2025-09-01`，用户 API Key 只通过 OwnDsh Settings → MCP 的端侧输入保存并生成 `Authorization: Bearer`。独立 HTTP initialize/tools/list 已返回 `apifox-mcp-server` 的 18 个工具。真实 Web 新会话只给自然语言“查询我可访问的项目”，LLM 先调用 `mcp_tool_search`，再自主调用 `mcp__apifox__listAccessibleProjects`，返回项目名称和 ID；没有预填工具名或参数。随后端侧断开，Settings 仍保留管理员下发的 MCP 行并显示未连接/无可用工具，LLM 后续请求的远端工具列表不再包含 Apifox；Harness profile 中不存在该 API Key，管理端 `auth_json` 只保留认证元数据。该结果证明远程 API Key、按需加载、断开撤销工具投影和清理链路可用；Apifox 旧版 `npx apifox-mcp-server` stdio 与新版远程 MCP 是两条不同产品链路。
2026-09-15 验收运行面收敛：当前产品只将 Harness Web 作为 MCP 真实 E2E 运行面，Desktop E2E 不作为发布门禁。Notion 已完成真实 OAuth 连接后的 Web 闭环（授权凭据、工具发现、按需加载和工具调用）；OAuth discovery、PKCE、refresh rotation、过期、`invalid_grant`、取消和迟到写入仍由本地真实 HTTP provider fixture 覆盖，未宣称第三方 provider 的全部异常行为都一致。

2026-09-15 MCP 收口验证：Harness Web 当前运行面复核通过，OwnDsh Settings → MCP 同时显示 `fullfixture`（2 个工具、直接可用）与 Notion（OAuth、41 个工具、按需加载）。插件工作区 `pnpm run check` 全部通过：contracts 生成/类型检查与 9 条测试、platform-client 31 条、ui 20 条、llm-gateway 7 条、plugin-distribution 27 条、bundle 33 条、workspace 边界 4 条；Console MCP/路由 40 条与 TypeScript 检查通过；Server `McpGrantIntegrationTest` 通过，Flyway V32 迁移校验通过。MCP 核心实现、管理端、端侧 Web UI、API Key/OAuth、search/full、连接生命周期和真实 Web 闭环达到第一版收口标准。

2026-09-16 职责边界纠正：AgentLoop、会话保存/恢复与 compaction/spill 是 deepseek-harness 的宿主能力，不属于 OwnDsh 新增功能，也不将宿主压缩算法的专项验收列为 MCP 实现缺口。OwnDsh 仍需负责自己的集成行为：每次请求按当前连接、授权和 Agent 热集合投影工具，撤销后不能借历史工具名继续执行；已有请求投影、会话隔离和撤销测试只证明这些行为，不冒充宿主压缩测试。旧版本 Server/插件组合属于 OwnDsh 的版本兼容范围，与 Harness 会话压缩无关；当前未验证全矩阵，不承诺任意新旧版本组合兼容。此前笼统将这些项目列为“剩余功能”或直接宣布“不阻塞发布”的表述作废。

2026-09-16 固定请求头与 API Key 原样值收口：Console 添加/编辑 MCP 弹窗提供固定 Header 键值表（如 `X-Apifox-Api-Version: 2025-09-01`）；API Key 元数据仅保留 `headerName`。端侧输入单个完整认证值，原样保存并交给官方 MCP client，不添加 Bearer、不去除前缀、不按 Header 名称猜测格式；OAuth 继续遵循 Bearer 协议。移除契约中的 `valuePrefix`，V33 只清理受影响的旧配置并推进服务/租户 revision，旧 API Key 连接需重新输入完整值；此前 Apifox 验收中自动拼接 Bearer 的行为不再适用。

本轮验证：Console 16 条交互测试与类型检查通过；官方 MCP client 的 3 条真实 HTTP 回归覆盖 `Authorization: Bearer xxx`、`Authorization: xxx`、`X-API-Key: xxx` 及固定版本 Header 同时出站；Server 8 条 MCP 集成测试和 8 条迁移测试通过（修正历史最新版本断言后，单独复跑该方法通过）。插件正式构建、打包与服务端 prod 打包通过；本地 Server 已迁移至 V33，健康检查为 UP，Harness 已安装相同构建产物并重启。浏览器核对添加弹窗支持固定 Header，API Key 无前缀配置，重启后管理目录可正常读取。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

2026-09-17 OAuth 失效恢复回归：新增 search/full 参数化场景，从本机 OAuth start → 真实 loopback/PKCE → HTTP token exchange → 官方 MCP client 调用，在同一 Agent 已取得 Schema 后制造 token 过期与 refresh `invalid_grant`；确认不发送旧 token、不重放失败工具、撤回工具与秘密、普通工具可用，重新授权后原 Agent 恢复。另制造 expires_in 到期前 tools/call 返回 HTTP 401，确认一次出站、不自动 refresh/replay，主动重新授权后恢复。Host 与 UI 增加 `MCP_AUTH_REQUIRED`、聊天恢复指引、OAuth 等待/取消和自动更新；UI 回归覆盖成功/失败/取消/截止时间/切换账号及迟到请求隔离。MCP 集成与凭据回归 32 条、UI 回归 31 条及插件构建通过。本段证据是可控 HTTP 集成测试；外部 Notion Web 异常 E2E 见下一条。

2026-09-17 Notion OAuth 异常 Web E2E：在本地 Server 18081、Harness Web 60465、官方 rc.2 运行树和本轮插件构建上完成。使用唯一测试会话 `a585b4a8-c278-4ef1-8b00-626cf1c31bf7`，上述四轮对话期间没有新建会话或重启 Host；模型、Notion OAuth 与 MCP 均为真实服务，提示词只要求只读查询工作区名称，没有指定工具名或参数。模型自主搜索并调用 `notion-fetch`。

| 步骤 | 故障制造 / 操作 | 实际结果 |
| --- | --- | --- |
| 正常授权与调用 | OwnDsh MCP tab 发起 Notion OAuth，在真实浏览器确认 loopback 授权 | 页面自动更新为已连接、41 个工具；自然语言查询成功 |
| 刷新授权失效 | 本机 Node inspector 一次性把 Notion manager 的内存 expiresAt 调到过去，将本次 refresh 请求中的 refresh_token 替换为无效测试值 | **真实 Notion** token endpoint 返回 HTTP 400 `invalid_grant`；不是伪造服务响应 |
| 聊天与工具撤回 | 在原会话要求重新实时查询，不使用历史结果 | 搜索返回 `MCP_AUTH_REQUIRED`；模型明确指引到 OwnDsh 设置 → MCP 重新授权，不执行 Notion 工具、不复用历史结果 |
| 设置页失效状态 | 打开 OwnDsh 设置 → MCP | 同一 Notion 行保留，显示“需要重新授权”、0 个工具；本机状态为 connected=false、configured=false |
| 取消重授权 | 点击重新授权后取消，再次开始授权 | 等待提示结束，仍保持需要重新授权；允许再次发起，无永久 spinner |
| 同一会话恢复 | 完成新的真实 Notion OAuth，再在原会话要求查询 | 设置页自动恢复已连接、41 个工具；模型重新搜索/调用并成功返回结果 |
| 正常自动刷新 | 再次仅将本地 access token 的 expiresAt 调到过去，保留真实 refresh token | **真实 Notion** refresh 返回 HTTP 200；工具重挂载、原会话重新加载并调用成功，无需用户重新登录 |

故障注入仅使用临时调试断点修改本机测试连接内存与一次请求参数；未更改产品代码、未拦截 fetch、未伪造 Notion 响应、未撤销工作区授权。故障脚本结束即移除全部断点与测试标记。E2E 完成后的 inspector 清理命令触发调试上下文动态 import 错误，测试 Host 退出；随后以无 inspector 的正常模式重启，已确认企业状态 READY、Notion 自动恢复已连接与 41 个工具，无需再次授权。此 E2E 覆盖 `search` 的真实浏览器/模型链路；`full` 同一 Agent 的失效恢复由 32 条 MCP 集成/凭据回归中的参数化用例覆盖。本轮额外 bundle 构建/入口测试 3 条通过，UI 31 条通过。提前 tools/call HTTP 401 仍只由可控 HTTP fixture 验证不重放，不能宣称官方接口已支持自动识别或所有第三方异常。


2026-09-17 MCP 设置页收口：每个服务使用独立卡片，工具数量可展开名称与服务原始 description，长目录在所属卡片内滚动；不改变 Agent 热集合。操作统一为启用/禁用/断开连接，移除新增常驻说明和按钮 tooltip；禁用卡片隐藏工具数量。官方 MCP runtime 17 条与 UI 31 条回归通过，最终样式/条件显示版本构建通过。最新版 tgz 已装入本机 Web profile，Host/Client 产物 SHA-256 与构建一致。真实 Harness Web 验证 Notion 的 41 项工具简介、禁用后保留卡片且无工具数量、启用无需重新 OAuth 恢复连接；当前目录仅有 Notion，本轮未声称多服务或窄屏的实际浏览器验收。


2026-09-17 MCP 描述预览优化：工具目录使用原生 details/summary，默认仅渲染原 description 前 240 个字符的三行纯文本预览；用户逐项展开时才渲染完整原文，收起恢复预览。数量入口仅数字可点击，“个工具”作为普通文字，禁用时继续隐藏数量。真实 Harness Web 的 Notion 41 项工具默认全文节点为 0，预览合计 8406 字符（原描述 53630 字符，减少约 84%）；预览高度最多三行，单项可展开全文并通过 Enter 收起。该结果证明 DOM 文本量下降和交互正确，不等同于帧率性能基准。UI TypeScript 检查、4 条现有 account-view 回归及插件构建通过；安装后 Host/Client 产物 SHA-256 与构建一致。


2026-09-17 短描述交互修正：展开入口仅在字符预算截断或三行实际溢出时出现，ResizeObserver 负责宽度变化后的重新测量；短描述直接渲染为无交互文本。真实 Harness Web 的 Notion 41 项目录验证为 10 项普通文本、31 项可展开，普通文本没有隐藏溢出，notion-get-session-status 无 summary/button/tabindex；长描述通过 Enter 展开后完整渲染 1624 字符，再次 Enter 可收起。UI 类型检查、插件构建和 diff 检查通过，安装产物与本次构建一致。

2026-09-17 账号入口与刷新反馈收口：移除 OwnDsh 的 sidebar.footer.action 注册及侧栏依赖，账号信息、退出确认集中在 OwnDsh 设置 → 账号，保留原登录门禁。手动刷新复用 store 动作锁，显示旋转图标、“刷新中”和最终成功/失败；HTTP 异常及 Host 错误状态均按失败处理，允许重试，自动状态读取不触发成功提示。UI 32 条与 bundle 入口 3 条回归通过；真实 Harness Web 验证侧栏无退出入口、账号页退出确认可取消、刷新显示进行中后成功。Notion 与 Apifox 两个配置保留在本机测试目录。

2026-09-17 内网 HTTP OAuth 支持：管理页、服务端公共元数据及端侧 OAuth 统一接受 HTTP(S)，管理员填写 HTTP 地址即可，MCP transport 标记由 URL 派生。端侧 token exchange/refresh 共用 URL 校验；PKCE/state、issuer/resource 绑定、userinfo/片段拒绝、取消隔离和禁止自动重定向继续保留。真实 HTTP provider fixture 直接处理授权页面跳转、loopback callback、code exchange 和 refresh，不再把 HTTPS URL 改写为本地 HTTP；分别覆盖手工端点、发现和动态 public client 注册。search/full 同一会话失效/重授权也直接使用 HTTP token endpoint。MCP OAuth/runtime 37 条、Console MCP 21 条、Server MCP 9 条回归通过；Console 类型检查、插件正式构建和服务端 prod 打包通过。上述证据覆盖 OwnDsh 的 HTTP 能力，不代表已验证用户内网 OAuth provider 的业务配置。

2026-09-17 按需加载故障排查：用户报告来自另一套桌面环境，未取得该环境原会话日志，不能把模型关于“始终只有初始六个工具”的自述当作实际出站 Schema。使用原问题“看看我notion的mcp，能干啥？”在本地 Harness Web、真实模型和 Notion 创建会话 `ecf8b218-f724-43dd-8dbc-d30313959da7`；逐次读取官方持久化 `request/header`，三次搜索分别返回 6/8/7 个 loadedNames，下一步请求分别包含 6/10/7 个 Notion 工具，三批的遗漏数均为 0。第二轮只读询问当前工作区，模型自主重新搜索并成功调用之前已被 LRU 淘汰的 notion-fetch。该证据证明本地普通跨步注入正常，不证明远端报告无问题，也不是网络抓包；期间 Agent Session 工具的 Notion 403 权限拒绝与 Schema 注入分开记录。

同轮排查确认 OwnDsh 存在另一条可复现缺陷：一个模型响应中多次执行搜索，中间未发生 inference，后一次搜索可按 LRU 淘汰前一次刚返回的 loadedNames，使“下一步可用”的承诺失效。数量上限与 64KiB 字节上限两个回归均先失败；修复后按 Agent 临时保留尚未呈现的加载结果至下一次成功 assembly，空间不足返回较少结果或 BUDGET_EXCEEDED，随后恢复常规 LRU，撤权/连接失效不受保留约束。搜索说明同步解释历史加载可能被后续搜索淘汰；不修改第三方 MCP Schema 或参数。

本轮验证：MCP runtime 19 条通过，bundle 类型检查和正式构建通过；临时受控模型驱动本地官方 AgentLoop，每次在同一模型响应产生三批搜索，数量预算返回 8/8/0、字节预算返回 6/0/0，所有成功 loadedNames 均在下一步模型 adapter 请求中，随后真实调度执行首批工具成功。该 AgentLoop 探针使用受控工具与模型，无外部 MCP 调用；上述 Notion Web 复现使用修复前的已安装插件，不能冒充修复版外部 E2E。修复尚未发布，远端桌面具体事件仍需原始日志才能归因。

HTTP改动的本地运行环境已更新：Server 18081 替换该次 prod JAR 后健康状态 UP；Harness Web 60465 安装的是HTTP改动tgz，Host/Client SHA-256与该次构建一致、配置刷新READY；Console 18080继续提供源码页面。上述搜索/释放新改动尚未安装到这个Web实例，也未发布。

2026-09-17 搜索设计最终收敛（替代上文LRU及临时pending方案）：用户选择保留已加载工具、由模型显式释放，并要求简化自定上限。删除16工具/64KiB会话预算、LRU/pending/result-touch及full自动降级；保留目录异常输入保护和每次5/8个搜索结果。新增mcp_tool_release，完整验证后仅修改本Agent的下步选择，重复释放幂等、full固定工具不释放；本步presented快照来自实际native/SDK定义，搜索和释放不改变本步调用许可，实时撤权/定义变化仍立即拒绝。原始Notion定义不作兼容补丁。端侧设计6.5提供最终Mermaid图，6.7记录OpenAI/Anthropic官方机制与限制；此前预算版本的验证只是历史证据。

最终版本验证：`pnpm exec vitest run tests/mcp-runtime.spec.ts` 28条通过，覆盖native/PTC/both × TypeScript/Python的真实pi-ai HTTP请求与释放后的Schema/SDK消失，连续三批搜索24个工具保留、长定义超过旧64KiB限制、full不降级、重复搜索/释放、非法释放批次无部分提交、Agent隔离、连接状态不受释放影响、控制名称冲突、scope撤销与代次变化。UI现有32条通过，UI构建、bundle类型检查与正式构建通过。临时受控模型驱动本地官方AgentLoop的三个场景通过：普通/长定义均搜索8+8+8后下步包含24个Schema，首批工具成功执行；本步release旧工具+search新工具时旧调用成功、新调用提前拒绝，下一步新工具成功。探针证明调度/注入接缝，不证明真实模型会主动或及时释放工具；PTC解释器仍用受控binding替身。HTTP版外部Notion复现与此次源码验证严格分开，未获远端原日志，不能宣布远端具体事件已定位。
