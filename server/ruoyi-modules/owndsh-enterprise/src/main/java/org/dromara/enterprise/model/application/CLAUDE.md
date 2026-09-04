# model/application/

> L2 | 父级: ../CLAUDE.md

成员清单

ModelMutationContext.java: 管理写事务的可信 tenant/actor/request 审计上下文。
ProviderSecretInput.java: 一次性 provider credential 字符容器，提供防御性复制、脱敏与清零。
ProviderSpec.java: 不含密钥的 provider 写 command，统一校验 Harness route ID、官方保留路由、协议、endpoint 与 timeout。
ManagedModelSpec.java: 模型写 command，约束 alias、上游标识、容量、reasoningEfforts/compat、排序和 default sentinel 边界。
ModelGrantSpec.java: 授权写 command，封装模型/模型集资源、全员/用户组/成员主体与状态事实。
ProviderProbe.java: provider `/models` 探测端口，只允许分类、延迟与脱敏模型 ID 候选越过边界。
JdkProviderProbe.java: JDK HttpClient 无重定向探测 adapter，以 4 MiB 上限解析 OpenAI `data[].id` 且丢弃其余正文。
ProviderChangeMetadata.java: PROVIDER_CHANGED 审计 metadata 白名单。
ManagedModelChangeMetadata.java: MODEL_CHANGED 审计 metadata 白名单。
ModelGrantChangeMetadata.java: MODEL_GRANT_CHANGED 审计 metadata 白名单。
ModelResourceNotFoundException.java: 模型纵向资源不存在的稳定领域异常。
ProviderService.java: provider CRUD 子集、route/type/protocol 不可变约束、秘密加解密、CAS/bootstrap revision/审计事务与模型发现测试编排。
ManagedModelService.java: 模型含 reasoning 配置的 CRUD/排序/启停、协议兼容校验及 CAS/bootstrap revision/审计事务编排。
ModelGrantService.java: 单条/批量授权、重复约束、主体/资源校验、CAS/幂等删除和原子审计编排。
ModelSetService.java: 模型集 CRUD、成员整体替换、引用保护、revision/bootstrap revision 与审计事务编排。
EffectiveModelResolver.java: 全员与当前成员授权并集、模型去重及排序首项 fallback default 的纯裁决器，原样携带模型推理事实到 bootstrap 与网关。
BootstrapUser.java: runtime bootstrap 所需的当前 Host 用户最小事实。
BootstrapService.java: ACTIVE 设备/用户/revision/有效模型、配额与插件分配组合查询；Session policy 留给 T16。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
