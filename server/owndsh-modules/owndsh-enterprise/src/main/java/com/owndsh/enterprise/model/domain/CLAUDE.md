# model/domain/

> L2 | 父级: ../CLAUDE.md

成员清单

ProviderApiProtocol.java: 对齐 Harness 支持的 openai-completions、openai-responses、anthropic-messages 三种 wire protocol 标识，连接协议约束在 ProviderConnection 上校验。
ModelStatus.java: provider、model、grant 共用的 ACTIVE/DISABLED 状态真源。
GrantSubjectType.java: ALL_MEMBERS/ACCESS_GROUP/MEMBER 授权主体封闭枚举，拒绝部门和任意表达式进入模型访问。
GrantResourceType.java: MODEL_SET/MODEL 授权资源封闭枚举，不接受标签或路由规则。
ModelProvider.java: 供应商元信息聚合根，端点与密钥由 ProviderConnection 持有。
ProviderConnection.java: endpoint、协议、模型发现路径、超时、密文和状态组成的真实上游连接聚合。
ModelInputModality.java: text/image 输入能力枚举。
ManagedModel.java: 员工可见 alias 到 provider/upstream model 的受管映射，携带容量、reasoningEfforts 三态、completions compat、排序与 revision。
ModelReasoningEfforts.java: pi-ai 七档 canonical effort 到 wire 值的 false/object 模型事实，严格区分省略、禁用与显式映射并拒绝未知或空档位。
ModelReasoningCompat.java: 仅供 openai-completions 使用的八种 thinkingFormat 与 supportsReasoningEffort 覆盖，省略字段保留自动探测语义。
ModelGrant.java: 模型或模型集到全员、用户组或成员的授权事实，主体/资源名称仅作为管理读投影。
ModelSet.java: 扁平模型集合、完整成员模型 ID 与 revision 的批量授权资源事实。
GrantedModel.java: ACTIVE join 查询的不可变候选，携带 Harness 模型字段、推理事实与排序供纯解析器去重裁决。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
