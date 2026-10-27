<!--
[INPUT]: 依赖 model-onboarding-design.md 当前版本、contracts/model 契约、server model/quota/audit 实现与 db/migration 现状，以及 Magpie、cc-switch、Sub2API 公开源码结构。
[OUTPUT]: 提供模型接入设计的历史终审事实、全新切换裁决、建议项与已验证代码锚点；R8/R16 的 Provider RATE 方案已被后续范围决策取代。
[POS]: docs 的模型接入设计终审记录；约束 model-onboarding-design.md 第 15 节冻结清单签字前的修订，本文不承载实现。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh 模型接入设计评审（终审）

状态：`final`

评审日期：2026-10-16（Asia/Shanghai）

评审对象：[model-onboarding-design.md](model-onboarding-design.md)（状态 `proposed`，含第 0 节代码事实基线的当前版本）

评审方法：设计文档的每条现状断言对照仓库代码逐条核验（contracts/、server/、db/migration/、console/），并对照 Magpie、cc-switch、Sub2API 的公开源码结构；本文引用的行号均为评审当时实读位置。

## 1. 终判

**历史结论：approve with required changes。领域模型骨架（Provider / ProviderConnection / ManagedModel 三层 + 模型钉死 `connectionId`）批准并建议冻结。后续范围决策已将 Provider RATE、Connection RATE 和旧实现兼容从目标中移除，当前以设计文档第 15 节和第 10 节的全新切换边界为准。**

### 1.3 后续范围裁决（2026-10-19）

项目尚未上线，没有需要保护的历史数据、外部 API 消费者或旧客户端。因此实现采用一次性干净切换：不保留旧 Provider 字段映射、双写、旧接口投影、历史数据回填、旧密文 AAD 重绑定或兼容 shim。

Provider 只保存供应商元信息；ProviderConnection 保存端点、协议、凭据和连接状态；ManagedModel 显式绑定 `connectionId`。速率限制本期只按模型配置，不实现 Provider 级、Connection 级或模型集级 RATE。原评审中的 R8（Provider RATE 锚点）和 R16（Provider RATE 两跳 join）因此不再是当前设计门禁，保留在下文仅作为被取代的历史评审记录。

### 1.1 设计空间定位

三个参照项目的真实骨架（源码实读，非转述）：

| 系统 | 凭据 | 端点 | 模型身份 | 路由 |
|---|---|---|---|---|
| [Magpie](https://github.com/yetone/magpie/blob/main/docs/subsystems/providers-accounts.md) | 融合在 Provider，**一个 Provider 挂 N 个 key 轮换池** | 融合在 Provider（每协议一个 base URL） | 独立的模型 picks 层，`provider/model` 引用 | 融合在 Provider（Fallback/Routing 字段） |
| [cc-switch](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/database/schema.rs) | 融合在 `providers.settings_config` | 独立 `provider_endpoints` 表，**仅 URL，key 不跟端点走** | 跟随 provider 配置 | 本地切换 + failover 队列 |
| [Sub2API](https://github.com/Wei-Shaw/sub2api/blob/main/backend/ent/schema/composite_model_route.go) | `Account` 独立资源（凭据+端点） | Account 内 | `public_model → composite route` | 独立路由表（account 组 + priority） |
| **OwnDsh 目标** | `ProviderConnection` 独立资源 | Connection 内 | `ManagedModel`（alias + upstream_model） | **钉死单连接，无路由机器** |

由此得出的规律不是"大家都分离连接"，而是**分离深度取决于凭据扮演的角色**：个人工具里凭据是个人配置，融合即可（Magpie、cc-switch）；组织共享网关里凭据是被治理的共享资源——要归属、要轮换、要审计——必须独立成资源；商业转售中继里凭据是计费资源，独立之外还要池化和路由（Sub2API）。OwnDsh 是**单部署、单管理域、多用户共享**的治理平台，选择 Provider/ProviderConnection/ManagedModel 分离以明确凭据和路由边界。术语澄清：OwnDsh 不做多租户；企业表中的 `tenant_id` 是后台框架残留的部署级隔离边界（每部署单租户、无租户管理面），保留该字段，但设计文档引用它时应表述为代码事实，不作为产品能力。该段记录评审时的设计空间分析，当前目标以第 1.3 节为准。

评审时曾把 P2-08A 的 **Organization × Provider 共享 RATE 配额**作为硬约束；该历史判断已被第 1.3 节的未上线范围裁决取代，当前目标不实现 Provider RATE。

OwnDsh 相对 Sub2API 砍掉路由表（组/权重/priority）同样是正确取向：治理平台要确定性（"这个模型走这条连接这把 key"是可审计事实），不要可用性魔法。Magpie 的 key 轮换池和 `LearnAuthHeader` 自动猜测都不属于治理平台。将来需要 failover 时，`connection_id → connection_set` 是纯增量演进。

### 1.2 评分

| 维度 | 评分 | 依据 |
|---|---|---|
| 领域模型（三层 + 钉死 connectionId） | **A** | 治理平台在设计空间的正确点；批准冻结 |
| Provider 层职责定义 | B+ | 存在理由（配额锚点）未说破；三重运行门可简化（R8） |
| 迁移与兼容策略 | B− | AAD 迁移未设计（R1）；兼容层为无证据消费者付税（R3/R4）；R1/R3/R4 落定后可到 A |
| 交互 scope | B+ | 首跑路径正确；单模型提交浪费了架构红利（R9） |
| 文档工程（第 0 节代码基线） | **A** | 用行号锚点把"现状"从作者记忆换成可验证事实；**应成为所有设计文档的模板** |

## 2. 历史评审阻塞项（R1–R5、R16，已被第 1.3 节取代）

### R1 密文迁移的 AES-GCM AAD 重绑定未设计

- **问题**：现有 credential 密文的 AAD 绑定 `(tenantId, "ent_model_provider", providerId, "credential_ciphertext", keyVersion)`，见 [ProviderService.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/application/ProviderService.java:231)（表名与字段名常量在 :39-40）。密文迁入 `ent_model_provider_connection` 后表名与行 ID 均变化，**直接搬移密文字节会导致解密时 AAD 校验必然失败**。设计文档 §8.1 只有一句"API Key 继续由现有 AES-GCM 边界处理"（§11.1 同），未覆盖此事实。
- **要求**：§8.1 补充迁移设计——Flyway Java migration 内以旧 AAD 解密、以新 AAD（`ent_model_provider_connection` + connectionId）重加密；幂等键即 §13.2 已有的"provider→connection 稳定映射"；同步更新 T20 的 key 恢复演练范围。§13.2 增加断言"迁移后既有 Provider 凭据可解密并成功转发"。

### R2 连接 `apiProtocol` 可变性未冻结

- **问题**：现状 Provider 更新明确拒绝协议变更（[ProviderService.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/application/ProviderService.java:128)）。协议挪到连接后规则未定义。协议是模型配置的 load-bearing 前提：`ModelReasoningCompat` 仅对 openai-completions 合法，连接协议若可事后修改，绑定模型的 compat/能力字段会**静默变非法**。
- **要求**：§5.2 增加一句冻结决策——"连接的 `apiProtocol` 创建后不可变；更换协议等于新建连接"，与现状语义连续。

### R3 旧 Provider CRUD 在多连接下的写语义未定义

- **问题**：§10.2 写明"Provider CRUD 通过兼容层读写元信息和连接"，但一个 Provider 存在 N>1 条连接时，`PUT /providers/{id}` 携带的 baseUrl/credential **写给哪条连接**没有定义。测试入口已定义"唯一连接才解析成功"（§7.1），更新入口却空缺。
- **要求**：与测试入口同规则——N>1 时拒收连接字段并返回稳定错误码；**禁止引入"主连接"概念**（那是下一个隐式路由约定，正是本设计要消灭的东西）。若采纳 R4 的干净切换，本问题连同消失。

### R4 兼容层的消费者证据缺失（架构决策）

- **问题**：§10.2 以"已有外部脚本和验收夹具不应失效"为由维持三种兼容 shim（旧 Provider CRUD 投影、旧模型 `providerId`→`connectionId` 隐式解析、旧 test 单连接解析）。实际消费者盘点：Console 生成客户端（contracts 同仓生成）、Java 契约测试、fixtures——**全部在 monorepo 内**，"外部脚本"无证据。项目有硬切先例（P2-09 直接移除旧管理前端），dsh-compatibility.md 本身就有"接缝删除条件"教义；三个参照项目也无一维护双写投影。
- **要求**：先列举真实外部消费者清单；若为零，改为**一次干净切换**——旧 Provider 写形态删除或只读保留一个 release 并写明删除条件，Console 客户端与 fixtures 同 PR 重生成。为想象中的用户维护双协议形态，违反项目自身的熵减法则。

### R5 连接审计动作归属与 T19 封闭白名单冲突

- **问题**：§9.2 一边写"密钥加密和审计逻辑集中到 ProviderConnectionService"（新建连接、替换 Key、停用连接均为审计敏感动作），一边写"本期不新增审计动作"。而 `AuditAction` 是 T19 冻结的封闭枚举，当前仅有 `PROVIDER_CHANGED`/`MODEL_CHANGED`（[AuditAction.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/audit/AuditAction.java:22)）；旧版 `ProviderChangeMetadata` 也是封闭结构。连接审计必须单独进入 action 白名单，否则实现第一周就会撞墙。
- **要求**：二选一并写入 §9.2 与 §15：扩 `PROVIDER_CHANGED` 的资源语义覆盖连接（资源 ID 用 connectionId，metadata 白名单扩展），或新增 `MODEL_CONNECTION_CHANGED` 进入 action 枚举（这**就是**"新增审计动作"，需删除 §9.2 的矛盾表述）。

### R16 Provider RATE join 迁移门禁与共享桶回归测试

- **事实**：Organization × Provider 共享 RATE 是**实时生效的运行机制**，不是文档措辞。契约和领域校验限制为组织级 RATE；`findEffective` 当前按模型的 `provider_id` 匹配；Redis 按 `policyId` 建共享 ZSET，一条策略就是组织内该 Provider 全部模型共用的 RPM/并发桶。
- **迁移门禁**：设计文档已补充 §8.1.2、§9.2、§12.4 和 §13.2：`findEffective` 的 PROVIDER 分支必须沿“模型→连接→Provider”两跳 join 并保留 tenant 过滤；同一 Provider 多条 Connection 各挂模型时，必须命中同一个 policyId/Redis 桶；TOKEN 仍按模型或模型集粒度。失效模式仍是静默匹配失败，实施前不得以单供应商单模型测试代替该回归；对应实现验收以 [QuotaManagementIntegrationTest](../server/owndsh-modules/owndsh-enterprise/src/test/java/com/owndsh/enterprise/quota/QuotaManagementIntegrationTest.java:517) 为扩展落点。
- **与 R8 的关系**：R8 说的是"Provider 层为什么存在"，R16 说的是"拆成三层后这条账怎么续上"。存在理由越是硬（已发货、实时生效），迁移责任越重。

## 3. 强烈建议项（R6–R9，建议随冻结一并落定）

### R6 草稿 probe 路径命名

`POST /enterprise/admin/v1/model-onboarding/probe`（§7.1）以 UI 旅程命名协议资源。同节已定义 `/provider-connections/{id}/actions/test`，且现有协议面全部是资源名词（`/providers`、`/models`、`/model-sets`）。草稿探测本质是"无持久化连接的连接测试"，应为 `POST /enterprise/admin/v1/provider-connections/actions/probe`。向导会重设计，协议要活十年——**别让 Console 的页面流程渗进 API 面**。

### R7 草稿 probe 的出网边界

`ProviderSpec.requireEndpoint`（[ProviderSpec.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/application/ProviderSpec.java:50)）校验 scheme/host/userInfo/query/fragment/长度，但**不拦截私网/环回/链路本地地址**。现状测试动作已接受任意草稿 baseUrl（ProviderService.test），新集合级端点把任意 URL egress 的门槛从"先持久化 Provider"降为裸调用，任何 `ent:model` 持有者都可探测内网与云 metadata。§11.1 应增加出网目的地策略：可配置私网拒绝，或明确记为已接受风险。

### R8 Provider 层定位说破 + 运行门简化

- **说破必然性**：Provider 层存在的硬理由是 **Organization × Provider 共享 RATE 上限**，且经全链路核验为**实时生效、非文档遗留**（详见 R16 证据链与 §6 锚点）：契约把 `resourceType=PROVIDER` 钉死为仅允许 ORGANIZATION×RATE；`findEffective` 按模型的 `provider_id` 匹配生效策略；Redis 按 `policyId` 建共享 ZSET——同一组织任意成员打到该供应商任意模型的请求，扣的是**同一个 RPM/并发桶**（厂商"全账号 N RPM"合约的物理事实）。配额在 Provider 聚合、凭据在 Connection 变化，只有"Provider 在连接之上"能表达。这句应进 §1 与 §5.1 第一段，三层设计随之从"合理"升为"必然"。
- **可选简化**：当前设计为网关叠加第三重门（model && provider && connection 均 ACTIVE），三个参照项目最多两重。建议网关运行门 = model && connection；"停用供应商"实现为一个事务批量停用其全部连接（管理动作，不是运行时状态）。状态空间少一维，排障少问一句"到底是谁拦的"。

### R9 候选多选

设计自己的数据模型使批量添加几乎免费：alias 默认取 upstream id（`ModelAlias` pattern 兼容），保存循环调用现有单模型接口，契约零改动，仅第三步 UI 允许多选 + 一个可编辑小表格。企业接入一个新供应商平均 5–20 个模型，"每次提交一个"（§1、§6.4、§15-2）是对管理员的税。至少应写进非目标旁的"下一期第一件事"。

## 4. 次要项（R10–R15，顺手修）

- **R10**：§7.2 "幂等请求头"无实现证据；真实重试兜底是 `uq(tenant_id, name)` 与 `uq(tenant_id, alias)`（[V1__enterprise_core.sql](../server/owndsh-modules/owndsh-enterprise/src/main/resources/db/migration/V1__enterprise_core.sql:140)）。改措辞为"唯一约束兜底"，不宣称不存在的基础设施。
- **R11**：DeepSeek 官方的 providerKey 被锁死为 `deepseek-official`（[ProviderSpec.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/application/ProviderSpec.java:37)）。§6.2/§6.3 应写明：向导选择官方预设时 Provider ID 自动锁定，不提供输入框。
- **R12**：无密钥连接的目标语义未冻结。现状 credential 必填（§0.2 已如实记录），目标里 §6.2 的"API Key 已配置"暗示可不配置——允许与否需一句决策（探针对空 credential 现状直接拒绝，[JdkProviderProbe.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/application/JdkProviderProbe.java:37)）。
- **R13**：§12.1 "员工端/网关：无"表格行与 §9.2/§12.4 矛盾（网关服务端明确要改）。§1 已有诚实句子，表格行应改为"无协议与客户端改动，网关服务端小改"。
- **R14**：候选 `eligible` 资格规则（§5.3/§6.4）归属未定。建议：Server 探针返回原始候选，过滤归 Console——避免资格规则成为第二套协议语义（与 §2.2 原则 2 一致）。
- **R15**：§2.1/§2.2 对 Magpie 的转述与源码不符——Magpie 的 Provider **融合**端点、N key 轮换池与路由（Fallback/Routing 字段），并不把连接独立成资源；真正独立连接资源的只有 Sub2API。结论恰好不受影响，但设计真源不应留着错误论据；按 §1.1 的事实表修正，并把"凭据角色决定分离深度"作为正式论据。

## 5. 历史签字条件（已被第 1.3 节取代）

| # | 落点 | 内容 | 对应 |
|---|---|---|---|
| 1 | §8.1 新增小节 | AAD 旧解密→新重加密的 Flyway Java migration 设计与验收断言 | R1 |
| 2 | §5.2 加一句 | 连接协议创建后不可变，换协议=新建连接 | R2 |
| 3 | §10.2 加一句或改写 | N>1 拒收连接字段+稳定错误码；或列举消费者为零后改干净切换 | R3/R4 |
| 4 | §9.2/§15 改一句 | 审计归属二选一，删除"不新增审计动作"的矛盾表述 | R5 |
| 5 | §7.1 改路径 | `POST /provider-connections/actions/probe` | R6 |
| 6 | §11.1 加一句 | 出网目的地策略（私网拒绝或明记已接受风险） | R7 |
| 7 | §1/§5.1 加一段 | Provider = org×provider 配额锚点；运行门 = model && connection | R8 |
| 8 | §15 增补 | 上述决策对应的冻结条目 | 全部 |
| 9 | §8.1/§12 增补 | `findEffective` PROVIDER 分支改两跳 join；新增"同供应商多连接共享桶"集成用例 | R16 |

1–4、9 是硬墙，5–8 是一天决策。**冻结一个带着洞的设计比不冻结更糟——它会用文档的权威性把洞焊死。**

## 6. 评审事实锚点（已核验）

以下锚点在评审中实读核验，可作为后续修订的信任基线：

- 领域与现状：[ModelProvider.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/domain/ModelProvider.java:15)（融合字段与 DeepSeek 协议约束 :39-42）、[ManagedModel.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/domain/ManagedModel.java:11)、[GatewayRouteResolver.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/gateway/GatewayRouteResolver.java:58)（model→provider 直连 + ACTIVE 过滤）；
- 契约：[model.yaml](../contracts/components/model.yaml:105)（ProviderProbeRequest 无 apiProtocol）、[model.yaml](../contracts/components/model.yaml:187)（ProbeCategory 六值）、[model.yaml](../contracts/components/model.yaml:235)（模型写入必填 providerId）、[enterprise-openapi.yaml](../contracts/enterprise-openapi.yaml:89)（真实挂载 `/enterprise/admin/v1/providers`）；
- 数据与迁移：[V1__enterprise_core.sql](../server/owndsh-modules/owndsh-enterprise/src/main/resources/db/migration/V1__enterprise_core.sql:118)（ent_model_provider 连接字段、`fk_ent_managed_model_provider` on delete restrict、tenant+alias 唯一）；
- 探针：[JdkProviderProbe.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/model/application/JdkProviderProbe.java:24)（4 MiB/禁重定向/仅 Bearer/仅 `data[]`）；
- 配额执行链：[quota.yaml](../contracts/components/quota.yaml#L23)（PROVIDER 仅组织级 RATE）、[QuotaPolicySpec.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/quota/application/QuotaPolicySpec.java#L47)（组织级 RATE 强制）、[JdbcQuotaPolicyStore.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/quota/persistence/JdbcQuotaPolicyStore.java#L79)（findEffective 按 `pm.provider_id` 匹配 PROVIDER 策略）、[RedisQuotaRateLimiter.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/quota/persistence/RedisQuotaRateLimiter.java#L26)（per-policyId 共享 ZSET）、[QuotaManagementIntegrationTest.java](../server/owndsh-modules/owndsh-enterprise/src/test/java/com/owndsh/enterprise/quota/QuotaManagementIntegrationTest.java#L517)（现有单供应商单模型覆盖）；
- 审计：[AuditAction.java](../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/audit/AuditAction.java:22)（封闭枚举现状）；
- 参照源码：[Magpie providers-accounts](https://github.com/yetone/magpie/blob/main/docs/subsystems/providers-accounts.md)、[cc-switch schema.rs](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/database/schema.rs)、[Sub2API composite_model_route.go](https://github.com/Wei-Shaw/sub2api/blob/main/backend/ent/schema/composite_model_route.go)。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
