# model/domain/

> L2 | 父级: ../CLAUDE.md

成员清单

ProviderType.java: provider 来源封闭枚举，区分 DeepSeek 官方路由与管理员声明的自定义路由。
ProviderApiProtocol.java: 对齐 Harness 自定义路由的 openai-completions、openai-responses、anthropic-messages 三种 wire protocol 标识。
ModelStatus.java: provider、model、grant 共用的 ACTIVE/DISABLED 状态真源。
GrantSubjectType.java: ALL_MEMBERS/MEMBER 授权主体封闭枚举，拒绝部门和任意表达式进入模型访问。
ModelProvider.java: provider 聚合根，持有稳定 Harness providerKey、来源、API 协议、endpoint、timeouts 和 AES-GCM 密文但禁止直接进入 Web。
ManagedModel.java: 员工可见 alias 到 provider/upstream model 的受管映射，携带容量、reasoningEfforts 三态、completions compat、排序与 revision。
ModelReasoningEfforts.java: pi-ai 七档 canonical effort 到 wire 值的 false/object 模型事实，严格区分省略、禁用与显式映射并拒绝未知或空档位。
ModelReasoningCompat.java: 仅供 openai-completions 使用的八种 thinkingFormat 与 supportsReasoningEffort 覆盖，省略字段保留自动探测语义。
ModelGrant.java: 模型到全员或单成员的授权事实，subject/model 名称仅作为管理读投影。
GrantedModel.java: ACTIVE join 查询的不可变候选，携带 Harness 模型字段、推理事实与排序供纯解析器去重裁决。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
