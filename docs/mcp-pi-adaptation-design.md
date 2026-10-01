<!--
[INPUT]: 参考 Pi MCP 的曝光与检索实现，依赖 DSH 0.2.0-rc.1 的 native/ptc/both 工具管线，以及 OwnDsh 当前 MCP 连接与授权生命周期。
[OUTPUT]: 定义借鉴 Pi、以 DSH 使用体验为准的 MCP 曝光控制与工具检索目标设计，包括结构化结果、错误处理、删除清单和验收矩阵。
[POS]: docs 的 Pi MCP 适配目标设计；约束 mcp-runtime、mcp-tools、contracts 与测试实现，旧版 MCP 设计仅作为迁移前基线。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh MCP 曝光控制与工具检索详细设计（借鉴 Pi）

修订日期：2026-09-30  
状态：已实施，插件设置页、单元测试与目标 Harness Web E2E 已通过  
适用版本：OwnDsh 当前插件 + DSH 0.2.0-rc.1  
设计原则：**借鉴 Pi 的曝光控制、按需发现和代码编排思路，以 DSH 的工具策略、实际可用性与维护成本裁决实现；不追求与 Pi 完全兼容。**

2026-09-30 决策更新：用户明确要求“更合理，不希望完全对齐”，同时要求曝光与检索的标准实现尽量直接采用 Pi。本文因此采用“Pi 纯逻辑原样 vendoring，DSH 适配层隔离”的策略；不复制 Pi 的 active set、loadout、Codemode 或 MCP 运行时。当前 vendored Pi 主干基线为 `3dd803d7e780fb04b815261b510f76bff563d46d`，许可证为 MIT；宿主适配已落地，剩余端到端验收单独跟踪。

## 1. 先给结论

本设计不是在现有 full/search 上继续叠加能力，而是一次语义替换：

| 当前 OwnDsh | 目标态 |
|---|---|
| 服务器级 full/search | 迁移到 OwnDsh 的四个运行时曝光档位；接受 Pi 的五档配置输入，并把 `codemode-deferred` 投影为 OwnDsh 的 `codemode` |
| mcp_tool_search | 统一 tool_search 入口，服务 DSH 的发现与声明流程 |
| OwnDsh 自研加权搜索 + Orama | 原样采用 Pi 的 schema 文档构造、英文 tokenizer 和 BM25 纯逻辑；移除旧 Orama 包装 |
| mcp_tool_release | 删除；本期收敛为一个发现入口，避免额外的模型管理负担 |
| loaded/presented 旧状态语义 | 保留 Agent 隔离、本步快照和下步生效机制，改为按工具曝光计算 |
| DSH 的 native/ptc/both | 保留，作为宿主适配层，不冒充 Pi 曝光档 |
| MCP 连接、OAuth、授权、重连 | 保留，属于 OwnDsh/DSH 基础设施 |

迁移边界：

- 不再读取或写入 presentation: "full" | "search"；
- 不再注册 mcp_tool_search 或 mcp_tool_release；
- 旧搜索和释放接口退役，tool_search 使用一个适合 DSH 的输入输出契约；
- 复用既有机制，移除 full/search 分支，不为模拟 Pi 再造宿主运行时；
- 旧配置由独立迁移工具处理，运行时不接受旧字段。

### 1.1 对齐《You Said No MCP!》的真正取舍

文章的核心不是“把 Pi 的内部工具管理 API 搬过来”，而是把 MCP 变成一种接近 OpenAPI 的、可发现且可组合的结构化工具接口。OwnDsh 对齐以下四点：

| 文章观点 | OwnDsh 设计 | 结论 |
|---|---|---|
| 不把完整 MCP 工具表倾倒进模型上下文 | exposure + deferred/tool_search | 吸收 |
| 工具应靠名称、描述和 schema 被发现 | Pi 文档构造 + BM25，包含参数名和描述 | 吸收 |
| Codemode 的价值是组合、并行和中间结果留在代码侧 | 复用 DSH PTC，脚本直接调用结构化 MCP 工具 | 吸收 |
| MCP 工具应提供可供代码处理的结果 | 保留可用的 outputSchema 和实际 structuredContent，模型按字段说明编写映射 | 纳入验收；不承诺任意工具自动互通 |

完成标准是：模型可以低成本发现工具、取得调用所需的输入输出说明，再用代码选择字段并组合工具。普通中间数据留在脚本内，按需输出摘要或最终结果；图片及显式附加上下文仍按 DSH 原生规则处理，不能承诺所有中间内容都绝不进入上下文。

本设计明确不迁移 Pi 的通用工具运行时、Codemode 沙箱、active set API 或 loadout API；这些由 DSH PTC、assembly 和执行策略承担。

### 1.2 合理性优先的取舍

| 能力 | 本方案决策 | 理由 |
|---|---|---|
| 曝光与检索 | 采用 Pi 当前曝光解析和检索纯逻辑，外包一层 DSH 适配；工具级覆写和下一轮生效仍由 OwnDsh 管理 | 直接获得上游修复，同时不引入 Pi Agent 状态机 |
| 工具执行、审批、取消、错误 | 沿用 DSH；MCP isError 在当前 bridge 中作为失败进入管线，PTC 用 try/catch 处理 | 保持 MCP 与其他 DSH 工具的失败契约一致 |
| 输出结构 | 保留服务提供的数据和 schema；缺少 schema 不丢弃实际 structuredContent | 无类型提示不等于没有结构化数据 |
| 检索语言 | 只承诺 Pi 同等的英文检索；不实现中文分词、翻译或向量召回 | 不为 Pi 未提供的语言能力增加易错实现 |
| Agent 模式与默认值 | 尊重 DSH 模式；推荐缺省按可用通道选择，显式配置保持原意 | 不为使用 MCP 强制改变 Agent 的工具策略 |
| 字段映射、会话存储 | 模型写字段选择代码；复用 DSH 会话能力 | 不新增跨工具语义映射系统或 Pi 会话模拟层 |

不同于 Pi 的行为在对应章节说明实际契约和理由即可，不需要以“偏差审批”阻塞实施。保留成熟机制优先于重写；收益由可用性、上下文成本、检索质量和回归结果证明。

## 2. 目标与非目标

### 2.1 目标

1. 提供服务器默认档与工具覆写，采用清晰稳定的精确名/通配符优先级。
2. 工具声明、代码说明和执行范围符合第 8 节的 DSH 模式契约。
3. tool_search 按名称、描述和参数 schema 检索，按英文元数据提供确定性排序，命中结果下轮生效。
4. 适配 DSH 的 native、ptc、both，不要求 DSH 核心增加 Pi 专用 API。
5. 保留 OwnDsh 的企业授权、凭据、连接代次和实时撤权。
6. 让旧 OwnDsh 代码在迁移完成后没有第二套可见语义。
7. 结构化结果、字段说明与错误处理完整经过 DSH 工具管线。

### 2.2 非目标

- 不引入 Pi 的 QuickJS/WASI 沙箱；DSH PTC 已覆盖代码执行侧。
- 不重写官方 MCP transport、OAuth、tools/list、tools/call。
- 不把 OwnDsh 的企业授权规则交给 Pi。
- 不保留 mcp_tool_release 作为“增强功能”；如果未来需要，另立产品扩展，不进入本次核心语义。
- 不承诺 DSH native-only Agent 能凭空提供 Pi 的代码调用面；这属于宿主能力约束，见第 8 节。当前 native 下显式 `codemode` 或 `codemode-deferred` 会不可达，建议改用 `deferred`；运行时不自动改写配置。

## 3. 当前源码基线

### 3.1 OwnDsh 当前实现

当前实现位于 [plugin/packages/bundle/src/mcp-tools.ts](../plugin/packages/bundle/src/mcp-tools.ts) 和 [plugin/packages/bundle/src/mcp-pi-search.ts](../plugin/packages/bundle/src/mcp-pi-search.ts)：

- 连接不再保存 full/search presentation；每个工具按四档 exposure 计算有效档位；
- native 默认 deferred，ptc/both 默认 codemode；显式 exposure 优先；
- `tool_search` 使用 Pi vendored 的英文 tokenizer、schema 文档和 BM25，命中结果写入当前 Agent 的下一轮选择；
- 重复命中幂等，不提供 release；
- assembly 过滤 native schema 并改写 PTC SDK，guard 依赖本步 presented 快照阻止未声明调用；
- 授权、连接代次、scope/restrict 和实时撤权仍由 DSH/OwnDsh 原有管线负责。

### 3.2 DSH 当前能力

OwnDsh 当前依赖：

- @deepseek-ai/dsh-tools@0.2.0-rc.1
- @deepseek-ai/dsh-ptc-runtime@0.2.0-rc.1

已核实的 DSH 行为：

- native：模型工具列表包含可见普通工具；
- ptc：模型工具列表只有 run_code；
- both：模型工具列表包含普通工具和 run_code；
- PTC bindings 来自注册表 schema，不是最终 assembly 的普通工具列表；
- PTC 子调用带 parent；
- 工具分发不读取最终模型声明列表，因此“注册但未声明”的工具仍可能被直呼；
- system-prompt assembly 的 waterfall 返回值是最终模型工具列表。

对应源码：

- [ToolRuntime.wireSchemas](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/core/tools/src/index.ts#L1007)
- [ToolRuntime.view / resolveExecution](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/core/tools/src/index.ts#L1177)
- [PTC bindings](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/core/tools/src/ptc.ts#L679)
- [system-prompt assembly](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/core/system-prompt/src/index.ts#L457)

因此 OwnDsh 仍需要 assembly 适配和执行守卫；复用当前快照与守卫机制，将 full/search 判断替换为工具级曝光判断。

## 4. 曝光模型（参考 Pi）

### 4.1 MCP 层：McpExposure

Pi 的 MCP 服务器默认值和工具覆写实际有五个档位：

| 档位 | 语义 |
|---|---|
| direct | 进入当前模式的声明面；native/both 提供原生声明，ptc 提供 SDK 说明 |
| codemode | 代码通道可调用，默认不进入模型声明和代码工具清单；可通过检索发现 |
| deferred | 默认不声明；检索命中后下轮进入当前模式的声明面，代码调用仍受 DSH 策略约束 |
| hidden | 注册但不可达；模型和代码都不能调用 |

| codemode-deferred | 代码通道可调用，但不列入 Pi 的 codemode 说明；由 `searchTools()` 发现 |

`codemode-deferred` 是 Pi 当前仍保留的正式 MCP 档位。Pi 随后通过 `toToolExposure()` 把它映射到普通工具的 `deferred`。OwnDsh 接受这五档输入，但由于 DSH 没有 Pi 的 codemode 说明和独立 ToolExposure 层，把它归并到 OwnDsh 的 `codemode` 运行时档位；这是一项明确的宿主适配取舍，不把它写成 Pi 的事实。发现后的 DSH 投影见第 8 节。

### 4.2 Pi 纯逻辑原样采用，宿主状态不迁移

Pi 的 `tool-search/tool.ts` 中，英文 tokenizer、schema 文档构造和 `Bm25Ranker` 是无宿主状态的纯逻辑；`core/mcp-servers.ts` 中的规范曝光类型、别名归一化和精确名/通配符解析也是可独立复制的纯逻辑。OwnDsh 直接复制这些实现，保留上游文件头、来源提交和 MIT 声明，不自行重写算法。

Pi 的 `searchAndLoad`、`createToolSearchToolDefinition`、`prepareLoadout`、`getActiveTools`/`setActiveTools` 以及 `mcp/index.ts` 的自动激活和会话记录依赖 Pi Agent 的 active set/loadout。OwnDsh 不复制这些 API，不把它们做成管理端配置，也不建立第二套通用工具运行时；只用 DSH 自己的 native/ptc/both、assembly、restrict、approval 和执行管线承接同一套纯逻辑结果。

同步边界固定为：

| Pi 内容 | OwnDsh 处理 | 后续同步方式 |
|---|---|---|
| `tokenize`、`schemaText`、`createToolSearchDocument`、`Bm25Ranker` | 原样 vendoring；只替换本地类型导入 | Pi 变更时按提交 diff 重新复制并跑同一组纯逻辑测试 |
| `McpExposure`、别名解析、工具覆写解析 | 原样采用算法；配置对象由 DSH contracts 包装 | Pi 变更时同步算法和测试，重新核对 DSH 配置字段 |
| `searchAndLoad`、`prepareLoadout`、active set/loadout | 不复制 | DSH 选择状态和下一轮 assembly 由 OwnDsh 适配层实现 |
| MCP extension、OAuth、transport、Codemode runtime | 不复制 | 继续使用 OwnDsh/DSH 现有实现 |

不能把 Pi 整个文件直接覆盖到 OwnDsh。Pi 的纯检索文件可以原样 vendoring，但其 `ToolDefinition`、active set、loadout、MCP transport 和配置存储都依赖 Pi Agent API；OwnDsh 只能复制无宿主状态的纯逻辑，再接 DSH 自己的适配层。

### 4.3 默认值

Pi 的 MCP 缺省是 `codemode`，普通 ToolExposure 的缺省是 `direct`；Pi 的 `codemode-deferred` 在工具层落成 `deferred`。OwnDsh 复制 MCP 缺省和解析优先级，但仍由 DSH 模式决定最终可用投影。

本设计推荐：用户未配置 exposure 时，具有可用 PTC 通道的 ptc/both Agent 使用 codemode；native Agent 使用 deferred。缺省值在每个 Agent 组装时解析，不写成服务器全局状态，不引入第六个曝光档。ptc/both 若缺少实际 runtime，按 DSH 配置错误提示处理，不能假定存在代码能力。

显式配置优先，显式 codemode 在 native 下不静默变成 deferred；它不会进入 native 声明或 tool_search 候选，用户应改用 `deferred` 或切换到含 PTC 的模式。该行为属于宿主约束，不改变服务器授权事实。

## 5. 配置契约

### 5.1 服务器级配置

目标配置示意：

    {
      "serverName": "notion",
      "displayName": "Notion",
      "exposure": "codemode",
      "toolExposure": {
        "search": "deferred",
        "create_*": "codemode",
        "delete_*": "hidden"
      }
    }

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| exposure | McpExposure，可省略 | 用户选择的服务器默认档；省略时使用 Pi 的 `codemode` 默认，再按 DSH 模式投影 |
| toolExposure | Record<string, McpExposure> | 单工具精确名或通配符覆写 |
| presentation | 不接受 | 旧的 full/search 字段删除 |

工具名使用 MCP 服务器返回的原始工具名，不包含 OwnDsh 内部的 mcp__server__ 前缀。

### 5.2 覆写解析

解析顺序固定：

1. 精确工具名；
2. 按配置对象插入顺序取第一个匹配的通配符；
3. 服务器级 exposure；
4. 按当前 Agent 可用通道解析缺省值，见第 4.3 节。

hidden 不是“从目录删除”，而是“注册后不可达”。这样工具仍可参与定义变更和代次管理，但不能进入模型、代码或执行管线。

### 5.3 配置迁移

本次运行时不兼容旧配置：

- full、search 不再进入类型定义；
- presentation 从 contracts、Server assignment、Host runtime 和 UI 中删除；
- 不在运行时隐式执行 full → direct 或 search → deferred；
- 如存在真实存量配置，提供一次性离线迁移脚本，迁移后只保存新字段；无存量则不提前开发脚本；
- 迁移脚本不得成为运行时第二套语义。

### 5.4 配置归属：插件保存偏好，管理端保存事实

Pi 的 exposure 配在本地 mcp.json，而不是 MCP 服务端。OwnDsh 应保持同一边界：

| 配置 | 归属 | 原因 |
|---|---|---|
| URL、transport、headers、auth 声明、timeout、reconnect、displayName | 管理端 | 企业连接事实，插件不能自行推导 |
| ALL/USER/GROUP 授权 | 管理端 | 真正的安全边界 |
| exposure | 插件端用户配置 | 上下文预算和使用偏好，不是授权 |
| toolExposure | 插件端用户配置 | 单个工具的使用偏好，不是企业权限 |
| MCP 选择状态 | 当前 Agent/session | 对话状态，不是服务器配置 |
| tool_search 的调用通道 | 插件运行时与 DSH Agent 模式 | 不复制 Pi 的 model-only 属性；具体入口见第 6.3 节 |

插件端保存的结构应接近 Pi：

    {
      "mcp": {
        "servers": {
          "notion": {
            "exposure": "codemode",
            "toolExposure": {
              "search": "deferred",
              "delete_*": "hidden"
            }
          }
        }
      }
    }

运行时把管理端 assignment 的连接事实与插件本地的 exposure 配置合并，再按第 5.2 节解析每个工具的有效档位。管理端不下发 exposure，也不把 toolExposure 写入企业合同。

管理端页面只提供服务配置、启停、成员/用户组授权和只读目录观察。插件设置页提供服务器默认 exposure、发现工具后的单工具覆写、有效档位预览和 native-only 的不可达提示。不要把 model-only 暴露成用户可选 MCP 档位。

员工端 MCP tab 通过官方 `configForms.get('owndsh')` 读取当前快照，并用嵌套 `mutate` 写入 `mcp.servers.<server>.exposure` 与 `mcp.servers.<server>.toolExposure.<tool>`。选择继承默认值时清除对应覆写；官方表单负责 revision、写入排队、冲突恢复和 Host 变更同步。管理端仍不保存 exposure 策略。

exposure 不是安全策略。企业若将来需要禁止某些高风险工具，应新增独立的工具授权/策略层作为上限，不能复用 hidden 或其他 exposure 冒充权限；本阶段不提前增加该层。

## 6. tool_search 设计

### 6.1 工具身份

统一使用：

    tool_search

不再注册 mcp_tool_search。采用通用名称，但本期只管理 OwnDsh 拥有且当前 Agent 有权使用的 MCP 工具；不扩展到其他插件的工具策略，名称冲突必须明确诊断。

本方案契约：

- schema：{ query: string, limit?: number }；
- 默认上限：8；
- 候选来自当前 Agent 可用通道中的 codemode 和 deferred；
- 已在当前通道提供完整调用说明的工具不重复推荐，单纯“可调用”不等于“已提供说明”；
- direct、hidden 及 DSH 策略不可用的工具不进入候选；
- 搜索结果使匹配工具进入下一次 DSH assembly 的 MCP 选择状态；
- 选择状态的变化从下一次模型调用开始生效；
- 重复命中幂等累加；
- 不提供 release 接口。

### 6.2 检索文档

每个候选工具参考 Pi 构造检索文档：

1. 工具名；
2. 工具名按下划线/驼峰拆开的文本；
3. 工具描述；
4. 参数 schema 递归收集的属性名；
5. 参数 schema 递归收集的 description；
6. MCP namespace 名称和描述；server instructions 仍作为 DSH system prompt 的独立区段。

英文的 camelCase 切分、小写化、停用词、词干化与 BM25 直接采用 Pi vendored 纯逻辑。检索文档同时收集工具名、描述、递归 schema 属性/描述、namespace 名称和 namespace 描述；server instructions 不进入 Pi 的检索文档，而由 DSH system prompt 独立承载。检索契约只覆盖英文文本；不实现中文分词、翻译、向量召回或其他语言专用处理。中文 MCP 仍可连接和直接调用，但中文描述与中文查询不保证被 `tool_search` 召回。只保留一条英文检索路径；Pi 上游后续调整时按来源提交纯逻辑和测试。

采用 Pi 的小型纯逻辑实现时移除旧 Orama 包装，不另加搜索框架或向量服务。同分规则固定并测试，任何参数调整应有实际检索用例支持。

### 6.3 tool_search 与 DSH 模式

Pi 将 tool_search 设为模型编排工具；DSH 的 PTC 模式只有 run_code，因此需要一个宿主适配：

| DSH Agent | tool_search 入口 |
|---|---|
| native | 作为普通模型工具声明 |
| both | 进入 native 声明；同时由宿主保证搜索结果更新下一轮 DSH MCP 选择状态 |
| ptc | 通过 DSH PTC binding 提供同一个 tool_search，输入输出契约与其他模式一致 |

DSH 模式决定调用通道；不为了 Pi 的 model-only 设置禁止 PTC 调用 tool_search。搜索返回摘要，下轮通过 native 声明或 PTC SDK 提供调用所需的输入、输出字段及描述，模型不必仅凭名字猜参数。

连接完成后检查发现与调用路径：

- codemode 需要可用的 PTC 通道；
- codemode 和 deferred 需要可用的 tool_search；
- 每个档位检查其实际需要的路径，缺少任一必要路径就提示，不能等到两条路径都不可用才报告；
- native/both 通过普通工具声明提供 tool_search，ptc 通过 run_code binding 提供；不覆盖 DSH 的 restrict 或审批策略。

当 MCP 使用 codemode 或 deferred 且当前 Agent 没有可用的 PTC/tool_search 路径时，必须给出不可达诊断；不能只完成 schema 注册就宣称 MCP 已支持。

## 7. 目标运行时架构

### 7.1 模块职责

建议将当前单一 mcp-tools.ts 拆成以下职责，避免迁移后继续保留旧概念：

| 模块 | 职责 |
|---|---|
| mcp-exposure.ts | McpExposure 类型、覆写解析、工具有效档计算 |
| tool-search.ts | vendored Pi 的英文检索文档与 BM25 纯逻辑，外接 DSH 的 tool_search 适配 |
| mcp-tool-surface.ts | 目录、代次、DSH 侧 MCP 选择状态、assembly 过滤和执行守卫 |
| mcp-runtime.ts | MCP 连接、授权、凭据、重连、挂载与撤销 |

模块之间的依赖方向：

    mcp-runtime
        └── mcp-tool-surface
              ├── mcp-exposure
              └── tool-search

连接生命周期不依赖搜索；搜索不依赖 OAuth；assembly 消费有效 exposure、DSH Agent 模式和当前 MCP 选择状态。Pi 的 active set/loadout 不作为 DSH 公共抽象复制。

### 7.2 注册期

MCP 连接完成 tools/list 后：

1. 注册所有工具定义；
2. 保存服务器默认 exposure、工具覆写、namespace 和 generation；
3. 计算每个工具的有效 exposure；
4. 将 codemode、deferred 工具加入检索目录；
5. 将 hidden 工具保留在注册表，但标记为不可达；
6. 不因为工具未进入模型声明而注销它。

注册期不做：

- 不根据 full/search 分支；
- 不调用 mcp_tool_search；
- 不创建旧的 server-level loaded 集；
- 不修改 MCP 工具的原始 schema。

### 7.3 组装期

每次模型请求前：

1. 读取 DSH 自己的 Agent 模式和 MCP 选择状态；
2. 读取每个工具的有效 exposure；
3. 依据 Agent 的 native/ptc/both 计算声明面；
4. 依据 PTC 代码说明规则计算 SDK 面；
5. 注入或更新 tool_search；
6. 保存本步声明快照，供调用守卫使用。

这里的选择状态只服务于 OwnDsh 的 deferred 工具声明投影。DSH 的 Agent policy、restrict、approval 和执行管线仍是最终权威；OwnDsh 不实现通用的 getActiveTools、setActiveTools 或 prepareLoadout API。

### 7.4 检索期

当模型调用 tool_search：

1. 验证 query 和 limit；
2. 按当前授权、连接 generation 和有效 exposure 构造候选；
3. 使用 Pi vendored 的英文 tokenizer 和 BM25 排名；
4. 将结果工具加入当前 Agent 的 MCP 选择状态；
5. 当前正在进行的推理不改变；
6. 下一次 assembly 为 deferred 工具提供当前模式的声明，为 codemode 命中工具补齐当前 DSH 模式所需的调用说明；
7. codemode 保持代码调用意图，不因搜索改成原生直呼；
8. 当前结果只返回发现摘要；下一轮必须有匹配的调用说明，不能只返回名字却始终隐藏参数与输出字段。

### 7.5 执行期

DSH 分发不读取最终模型声明，所以 OwnDsh 守卫需要实施以下边界，并始终服从 DSH 的 scope/restrict/approval：

| 调用来源 | 放行条件 |
|---|---|
| 模型直呼 | 工具在本步 native 声明快照中，且不是 hidden |
| PTC 子调用 | 来自 DSH PTC、符合当前曝光通道，且授权、scope、generation 和定义仍有效 |
| 任意来源 | 连接撤销、授权失效、定义变更时立即拒绝 |
| hidden 工具 | 模型和代码都拒绝 |

parent 表示嵌套调用，不是新的授权凭证；只有与 DSH run_code 执行关联的子调用才按 PTC 处理，不能把其他编排工具的任意嵌套调用一概放行。绑定的调用身份由 DSH 管线提供，不能信任工具参数自报来源。

### 7.6 结果结构与字段映射

MCP 规定工具描述、inputSchema、可选 outputSchema 和 structuredContent 的协议位置，但不统一业务字段。LLM 根据 A 的输出说明、B 的输入说明和任务要求编写字段选择与转换代码；类型相同也不证明语义相同，例如两个系统的用户 ID 不能仅因都是字符串就互用。

Pi 源码核对基线：[3dd803d](https://github.com/earendil-works/pi/tree/3dd803d7e780fb04b815261b510f76bff563d46d)。以下是上游事实；纯逻辑按第 4.2 节原样 vendoring，宿主契约不复制：

- [tool-search/tool.ts](https://github.com/earendil-works/pi/blob/3dd803d7e780fb04b815261b510f76bff563d46d/packages/coding-agent/src/extensions/tool-search/tool.ts#L39-L157)：`tokenize`、schema 文档递归收集、`createToolSearchDocument` 和 `Bm25Ranker` 不依赖 Pi 会话状态；其正则只处理 ASCII 字母/数字，中文检索不属于 Pi 的支持契约。
- [core/mcp-servers.ts](https://github.com/earendil-works/pi/blob/3dd803d7e780fb04b815261b510f76bff563d46d/packages/coding-agent/src/core/mcp-servers.ts#L17-L175)：五个 MCP `McpExposure`、精确名优先及通配符解析可直接采用；`codemode-deferred` 在 `toToolExposure()` 中映射为普通工具的 `deferred`，传输、OAuth 和配置存储仍使用 OwnDsh。
- [extensions/tool-search/tool.ts](https://github.com/earendil-works/pi/blob/3dd803d7e780fb04b815261b510f76bff563d46d/packages/coding-agent/src/extensions/tool-search/tool.ts#L196-L214)：`searchAndLoad` 依赖 Pi 的 active set，不能直接复制；OwnDsh 只复制排名结果，再写入自己的下一轮 assembly 选择状态。
- [extensions/tool-search/tool.ts](https://github.com/earendil-works/pi/blob/3dd803d7e780fb04b815261b510f76bff563d46d/packages/coding-agent/src/extensions/tool-search/tool.ts#L233-L270)：`tool_search` 的 `model-only`、`prepareLoadout` 和执行包装依赖 Pi `ToolDefinition`，由 DSH 模式适配层重建。

- [createMcpResultSchema / convertMcpResult](https://github.com/earendil-works/pi/blob/3dd803d7e780fb04b815261b510f76bff563d46d/packages/coding-agent/src/extensions/mcp/tools.ts#L98)：为每个 MCP 工具包装 CallToolResult schema，并把去掉顶层 _meta 的协议结果交给脚本，包括 content、可选 structuredContent 和 isError；未提供业务 outputSchema 也保留返回对象。
- [renderToolSignature](https://github.com/earendil-works/pi/blob/3dd803d7e780fb04b815261b510f76bff563d46d/packages/codemode/src/declarations.ts#L132)：有业务 schema 时生成 CallToolResult<T>，没有时保留通用 CallToolResult；类型提示不能代替执行时校验。
- [toScriptValue](https://github.com/earendil-works/pi/blob/3dd803d7e780fb04b815261b510f76bff563d46d/packages/coding-agent/src/extensions/codemode/execute.ts#L199)：带 outputSchema 的 Pi 工具可以把 structuredContent 交给脚本。由于 MCP 适配器总是提供外层结果 schema，不能据此推断“远端没有 outputSchema 就只剩字符串”。

OwnDsh 继续使用 DSH 的 createMcpToolDefinition、output.schema、官方 TS/Python renderer 和 canonical value，不另造 Pi 结果包装器：

| 服务实际提供的结果 | DSH/PTC 处理 |
|---|---|
| 有 outputSchema 和 structuredContent | 保留对象、字段类型与描述，经官方 SDK/工具管线校验可支持的契约，并在提供调用说明时展示返回类型 |
| 无 outputSchema，但有 structuredContent | 保留实际对象；字段类型未知，允许脚本检查键名、类型或输出小样本，不能承诺自动知道字段 |
| 只有 content 文本块 | 保留原结果；脚本可按已知格式显式解析，解析失败可观察，不自动猜测或伪造 schema |
| schema 使用 DSH 不支持的特性 | 沿用官方 bridge/SDK 的校验与回退行为，不宣称全部 schema 都获得相同类型提示和校验覆盖 |

字段说明清晰时，一次 PTC 脚本可以取出 A 的 result.structuredContent.users 中合适记录的 id，再构造 B 的 { userId: id }。结构未知时，模型可以先输出必要的键名或小样本，下一轮再编排；不承诺每次都在单个脚本内完成。曝光隐藏后重新发现工具，必须同时恢复输入输出说明，才能支持这条链路。

### 7.7 错误处理沿用 DSH

Pi 的 MCP isError 结果可作为对象交给脚本检查；DSH 当前 MCP bridge 会将其转成失败，PTC 调用抛出 ToolCallError，由脚本 try/catch 处理。OwnDsh 保留 DSH 的统一行为，避免 MCP 工具与普通工具需要两套失败处理方式。

不捕获时让外层 run_code 明确失败；脚本捕获后可修正参数或报告失败，但不能静默吞错后当作成功。不自动重放可能有副作用的调用。业务错误的附加对象能否保留由官方管线决定，当前不承诺 Pi 式完整错误对象；以后只有出现实际消费者需求才评估扩展。

## 8. native / ptc / both 适配矩阵

曝光档描述工具的发现与使用意图，DSH 模式决定可用调用通道。以下矩阵是 OwnDsh 的目标契约，不标记为“Pi 等价”；`codemode` 在 native 下仍缺少代码执行通道，这是宿主事实。

| exposure | native | ptc | both |
|---|---|---|---|
| direct | native 声明，模型直呼 | SDK 声明，通过 run_code 调用 | native + SDK 声明 |
| codemode（未检索） | 显式配置下不可达；建议改档或切换模式 | 按名 binding 可用，默认不列入 SDK 说明，可检索 | 不进入 native；按名 binding 可用，默认不列入 SDK 说明，可检索 |
| codemode（已检索） | 不可达；不会静默改成 deferred | 下一轮补齐 SDK 说明，通过 run_code 调用 | 下一轮补齐 SDK 说明，通过 run_code 调用，不进入 native |
| deferred（未检索） | 不声明，可检索 | 不列入 SDK，可检索；有权限的按名 binding 可用 | 不进入 native/SDK，可检索；有权限的按名 binding 可用 |
| deferred（已检索） | 下一轮进入 native 声明 | 下一轮补齐 SDK 说明，通过 run_code 调用 | 下一轮进入 native + SDK 声明 |
| hidden | 无声明、不可调用 | 无说明、不可调用 | 两面均不可达 |

隐藏工具必须从提示和可调用范围移除；实现可利用 DSH restrict 或执行守卫，不能只删 SDK 文本而允许猜名调用。内部注册记录是否保留不作为对外兼容指标。

### 8.1 native

- native 能完整承载 direct、deferred 和 hidden。
- native 不能承载 codemode 的“代码可调”语义。
- 不把用户显式选择的 codemode 静默改写成 deferred，避免改变配置意图；当前配置错误只表现为工具不可达。

推荐缺省使用 deferred（见第 4.3 节），尊重现有 Agent 模式；显式选择 codemode 时由配置预览和状态接口暴露不可达结果，不阻塞整个 Agent 的其他能力，也不自动切换为 both。

### 8.2 ptc

- 模型工具声明只有 run_code；
- 普通 MCP 工具通过 PTC SDK/bindings 调用；
- direct 工具也必须在 SDK 说明或可发现 binding 中保持可调用，但模型的“直接调用”被投影为 run_code 内调用；
- codemode 工具可按名调用，检索前不列入 SDK 说明，命中后下轮补齐说明；
- deferred 检索前后都保持受 DSH 策略约束的代码可调用性；命中后下轮提供 SDK 输入输出类型；
- hidden 无说明、不可调用，猜测 binding 名称也不能执行。

tool_search 通过 PTC binding 提供；搜索后结束当前 run_code，下一轮取得说明后再编排依赖调用。

### 8.3 both

- direct：native 声明 + PTC SDK；
- codemode：不进 native；检索前不列入 SDK，命中后下一轮补齐 SDK 并提供受策略约束的 PTC 调用；
- deferred：检索前不提供说明；命中后下一轮进入 native 和 SDK 声明；
- hidden：两面都不可达；
- tool_search：进入 native 编排面，搜索状态由宿主同步到下一次 assembly。

## 9. DSH 侧 MCP 选择状态

Pi 用 active set 记录“哪些工具进入下一次模型声明”。OwnDsh 不需要复制这套通用工具 API，只需要在 MCP 适配层保存最小选择状态：

- 每个 live Agent 独立保存 MCP 选择结果；
- 搜索命中在下一次 assembly 投影为声明变化；
- 重复命中幂等；
- 工具 generation、授权或连接变化时清除受影响项；
- DSH 的 session/tree/resume/fork 是否持久化这份状态，按 DSH 会话能力决定；不能为了模拟 Pi 而引入第二套会话存储；
- 没有 DSH 会话持久化能力时，恢复为未选择状态即可；这影响体验连续性，不影响权限安全；
- 不提供 mcp_tool_release，也不把 Pi 的 active set API 暴露给其他 DSH 工具。

## 10. 连接和授权生命周期

以下逻辑继续沿用当前 OwnDsh：

- MCP Streamable HTTP client；
- API Key/OAuth 凭据归属；
- 平台 assignment、revision/CAS 和用户授权；
- 连接 generation；
- tools/list 完整替换；
- 连接撤销时 abort in-flight；
- 授权租约失效时拒绝新调用；
- namespace 冲突检查；
- MCP resources 独立于工具检索。

变化只有一项：连接完成后不再把 presentation 或企业侧 exposure 传给工具表面，而是把连接事实与插件本地偏好合并后传入：

    {
      serverName,
      displayName,
      exposure,
      toolExposure
    }

## 11. 删除与改造清单

### 11.1 代码

删除：

- McpConnection.presentation；
- full/search 分支；
- mcp_tool_search；
- mcp_tool_release；
- OwnDsh 自研 Orama 搜索；
- loaded/presented 中依赖 full/search 的判断，保留可复用的 Agent 隔离与快照机制；
- 旧的 MCP_TOOL_NOT_LOADED: 请先调用 mcp_tool_search 错误文案。

新增或改造：

- McpExposure 和 per-tool resolver；
- Pi 风格 tool_search；
- DSH 侧 MCP 选择状态；
- native/ptc/both projection；
- DSH 调用来源守卫；
- exposure/generation 变更失效逻辑。

### 11.2 合同、服务端和界面

删除：

- assignment 的 presentation 字段；
- search/full 枚举；
- 管理端和员工端的 full/search 选择控件；
- status 中的 effectivePresentation；
- 旧搜索结果字段 matches/loadedNames/releasedNames。

新增：

- 插件本地的 server default exposure；
- 插件本地的 per-tool toolExposure；
- 工具覆写的精确名/通配符校验；
- 插件端配置 schema、运行时有效 exposure 状态与 native-only 不可达结果；不在管理端写入策略；
- 管理端只读显示工具目录和连接事实，不提供 exposure 写入。

### 11.3 依赖

如果 @orama/orama 仅由旧 MCP 搜索使用，则迁移完成后从 bundle 的依赖和锁文件删除。若其他模块仍使用，则保留依赖；本期 MCP 搜索只保留第 6.2 节的一条实现路径。

## 12. 测试与验收矩阵

### 12.1 纯逻辑测试

- exposure 省略时按 Agent 模式解析缺省值；同一服务器在 native/ptc/both 中互不污染，显式配置优先；
- 精确名优先于通配符；
- 多个通配符取配置对象第一个匹配项；
- hidden 服务器只有显式覆写工具可达；
- `codemode-deferred` 接受为 Pi 兼容输入，并在 OwnDsh 运行时归并到 `codemode`；
- 精确名/通配符覆写解析不依赖连接状态；缺省通道能力在当前 Agent 验证；
- BM25 文档构造、英文词形处理和稳定排序用例；
- schema 参数名和 description 进入检索文档；
- direct/hidden 不进入候选；
- codemode/deferred 中尚未提供调用说明且当前通道可用的工具进入候选。

### 12.2 DSH 集成测试

对每个 native/ptc/both 运行：

| 场景 | 预期 |
|---|---|
| direct 冷启动 | 按模式进入声明/SDK |
| 缺省曝光冷启动 | native 用 deferred；PTC/both 有可用 runtime 时用 codemode |
| codemode 冷启动 | 不进声明和 SDK；代码按名可调用，tool_search 可检索 |
| codemode 命中 | 下一轮补齐 PTC 输入输出说明，仍无 native 声明 |
| deferred 冷启动 | 不进声明；tool_search 可检索 |
| deferred 命中 | 下一轮按 Agent 模式生效 |
| hidden | 两面均不可达 |
| 模型直呼未声明工具 | 被守卫拒绝 |
| PTC 子调用 | 来自 DSH PTC、符合当前曝光通道，且授权、scope、generation 和定义仍有效 |
| 当前推理中搜索 | 当前快照不变，下一轮生效 |
| 授权撤销 | 立即中断/拒绝 MCP 调用 |
| schema 代次变化 | 旧选择项失效，不能调用旧定义 |

### 12.3 结构化组合测试

- 真实 PTC runtime 串联两个 MCP 工具：脚本依据说明从 A 的 structuredContent 选字段、转换为 B 的输入；检查 B 实际收到的数据，不能仅验证类型声明或受控 binding；
- outputSchema 和字段描述进入对应 SDK；有效结果成功、违反受支持 schema 的结果明确失败；不假定两个工具的同类型字段业务含义相同；
- 无 outputSchema 但有 structuredContent 时保留对象，代码可以检查或输出必要样本；只有文本时保留 content，不自动猜测结构；
- 普通中间文本/数据未显式输出时不进入模型上下文；显式日志、样本、图片及附加上下文分别按 DSH 契约验证；
- 工具搜索当前只返回发现摘要，下一轮提供所需输入输出说明；仅能搜出名字却拿不到字段说明判为失败；
- MCP isError 沿用 DSH 失败契约，PTC 可用 try/catch 捕获；未捕获时 run_code 失败，审批拒绝与取消也不能被当作成功；
- 不自动重放产生副作用的失败调用，不要求 Pi 式错误对象返回。

### 12.4 迁移验收

- 代码库不再出现 mcp_tool_search；
- 代码库不再出现 mcp_tool_release；
- runtime/contracts/UI 不再出现 presentation: full/search；
- @orama/orama 仅在仍有真实消费者时存在；
- 英文检索、schema 字段命中和稳定排序通过用例，Pi 用例作为参考而非完全兼容判据；
- PTC、native、both 三种模式没有第二套搜索结果格式；
- 老配置只能被离线迁移工具处理，运行时拒绝旧字段。

## 13. 决策与设计建议

“更合理，不完全对齐”是已确认原则。以下条目记录相应设计选择；已实现行为以代码和第 8 节矩阵为准。

| 问题 | 推荐决策 |
|---|---|
| 是否要求与 Pi 完全对齐？ | 不要求；以四项核心收益、DSH 工具契约和实际验收为准；纯检索逻辑保持可替换的 Pi 版本 |
| native-only Agent 遇到 codemode 怎么办？ | 保持显式配置，不进入声明和检索候选；用户改为 deferred 或切换含 PTC 的模式 |
| PTC-only 是否允许调用 tool_search？ | 允许，通过 PTC binding 提供同一契约 |
| MCP 默认曝光是什么？ | 推荐未配置时 native → deferred，有可用 PTC 的 ptc/both → codemode；显式配置优先 |
| MCP 错误如何处理？ | 保留 DSH 异常与 try/catch，不模拟 Pi 的 isError 对象返回 |
| 无 outputSchema 怎么办？ | 有 structuredContent 则保留未知结构对象；只有文本则保留文本块，按需观察再编排 |
| 是否引入全局字段映射？ | 不引入；模型依据工具说明和实际数据编写映射，类型校验不保证业务语义正确 |
| 是否支持中文检索？ | 不支持；中文服务仍可连接和直接调用，但不得依赖中文 `tool_search` 召回 |
| 是否保留旧配置兼容？ | 运行时不保留；需要兼容时只做一次性离线迁移 |

## 14. 完成标准

只有以下条件同时满足，才算完成本次 MCP 改造：

1. 本文四个 OwnDsh 运行时 MCP exposure 与工具级覆写成为唯一运行时曝光配置，同时接受 Pi 五档输入并将 `codemode-deferred` 归并到 `codemode`；
2. tool_search 已成为唯一检索入口，英文检索和实际调用说明均可用；
3. OwnDsh 的 full/search、mcp_tool_search、mcp_tool_release 和旧 Orama 路径已删除；
4. DSH native/PTC/both 的 direct、deferred、codemode、hidden 关键投影均通过矩阵测试；
5. 执行守卫能区分模型直呼和 DSH PTC 子调用，并保留 scope/restrict/approval 的权威；
6. 授权、连接代次、撤销和恢复不破坏各 Agent 的 MCP 选择状态隔离；
7. contracts、管理端、员工端、运行时和测试不再引用旧字段；
8. 第 12.3 节通过真实 PTC 的字段映射、无 schema 结果保留、上下文投影和错误处理验收；
9. 文档与代码完成 GEB 回环更新。

这份设计以四项效果验收：**少占上下文、容易发现、能够编排、保留可处理的数据。Pi 提供参考实现，DSH 提供运行机制，OwnDsh 维护一套清晰且可验证的产品契约。**

## 15. Pi 上游同步流程

为使后续 Pi 优化可以低成本同步，保留一份 `UPSTREAM.md` 或等价的源码头部记录：Pi 仓库、提交 SHA、许可证、复制的文件路径和纯逻辑行段。每次同步按以下顺序执行：

1. 固定新的 Pi 提交并查看曝光类型、别名和检索纯逻辑的 diff；
2. 只替换 vendored 纯逻辑和对应纯逻辑测试；
3. 若 diff 触及 `searchAndLoad`、active set、loadout、MCP transport 或 Codemode runtime，停止自动覆盖，改由 DSH 适配层评估；
4. 运行曝光解析、英文 BM25、schema 文档构造和 native/ptc/both 集成验收；
5. 更新来源 SHA、许可证记录和本设计文档。

这样可以直接复用 Pi 的标准算法实现和后续修复，同时把 Pi 的宿主状态机变化隔离在 OwnDsh 之外。
