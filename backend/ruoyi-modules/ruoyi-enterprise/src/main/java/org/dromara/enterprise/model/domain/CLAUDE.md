# model/domain/

> L2 | 父级: ../CLAUDE.md

成员清单

ProviderType.java: MVP 上游协议类型封闭枚举，只允许 DeepSeek-compatible OpenAI API。
ModelStatus.java: provider、model、grant 共用的 ACTIVE/DISABLED 状态真源。
GrantSubjectType.java: 授权主体 USER/DEPT 封闭枚举，决定存在性与默认优先级。
ModelProvider.java: provider 聚合根，持有固定 endpoint、timeouts 和 AES-GCM 密文但禁止直接进入 Web。
ManagedModel.java: 员工可见 alias 到 provider/upstream model 的受管映射，携带排序、能力与 revision。
ModelGrant.java: 模型到用户/部门的授权事实，subject/model 名称仅作为管理读投影。
GrantedModel.java: ACTIVE join 查询的不可变候选，保留授权来源与默认标记供纯解析器裁决。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
