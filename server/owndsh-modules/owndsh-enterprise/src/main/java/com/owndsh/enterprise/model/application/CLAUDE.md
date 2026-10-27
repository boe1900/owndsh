# model/application/

> L2 | 父级: ../CLAUDE.md

成员清单

ModelMutationContext.java: 管理写事务的可信 tenant/actor/request 审计上下文。
ProviderSecretInput.java: 一次性 provider credential 字符容器，提供防御性复制、脱敏与清零。
ProviderConnectionSpec.java: 连接写 command，约束 endpoint、协议、模型发现路径、超时与发现/密钥边界。
ProviderSpec.java: 不含 endpoint 和密钥的 provider 元信息写 command。
ManagedModelSpec.java: 模型写 command，约束 alias、上游标识、容量、reasoningEfforts/compat、排序和 default sentinel 边界。
ModelGrantSpec.java: 授权写 command，封装模型/模型集资源、全员/用户组/成员主体与状态事实。
ProviderProbe.java: provider `/models` 探测端口，只允许分类、延迟与脱敏模型 ID 候选越过边界。
JdkProviderProbe.java: JDK HttpClient 无重定向探测 adapter，以 4 MiB 上限解析 OpenAI `data[].id` 且丢弃其余正文。
ProviderChangeMetadata.java: PROVIDER_CHANGED 审计 metadata 白名单。
ProviderConnectionChangeMetadata.java: MODEL_CONNECTION_CHANGED 审计 metadata 白名单，不承载连接密钥或端点正文。
ManagedModelChangeMetadata.java: MODEL_CHANGED 审计 metadata 白名单。
ModelGrantChangeMetadata.java: MODEL_GRANT_CHANGED 审计 metadata 白名单。
ModelResourceNotFoundException.java: 模型纵向资源不存在的稳定领域异常。
ManagedModelInUseException.java: 模型仍被配置或使用记录引用时的稳定领域异常，携带删除阻塞计数。
ModelSetInUseException.java: 模型集仍被授权或配额策略引用时的稳定领域异常，携带删除阻塞计数。
ProviderConnectionService.java: 连接 endpoint、协议、模型发现路径、密钥加解密、探测与 CAS/bootstrap revision 编排。
ProviderService.java: 供应商元信息 CRUD、后台生成 providerKey、CAS/bootstrap revision/审计事务。
ManagedModelService.java: 模型含 reasoning 配置的 CRUD/排序/启停、协议兼容校验及 CAS/bootstrap revision/审计事务编排。
ModelGrantService.java: 单条/批量授权、重复约束、主体/资源校验、CAS/幂等删除和原子审计编排。
ModelSetService.java: 模型集 CRUD、成员整体替换、引用保护、revision/bootstrap revision 与审计事务编排。
EffectiveModelResolver.java: 全员与当前成员授权并集、模型去重及排序首项 fallback default 的纯裁决器，原样携带模型推理事实到 bootstrap 与网关。
BootstrapUser.java: runtime bootstrap 所需的当前 Host 用户最小事实。
BootstrapService.java: ACTIVE 设备/用户/revision/有效模型、配额与插件分配组合查询；Session policy 留给 T16。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
