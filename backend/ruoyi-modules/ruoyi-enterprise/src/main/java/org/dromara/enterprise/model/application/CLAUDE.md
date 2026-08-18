# model/application/

> L2 | 父级: ../CLAUDE.md

成员清单

ModelMutationContext.java: 管理写事务的可信 tenant/actor/request 审计上下文。
ProviderSecretInput.java: 一次性 provider credential 字符容器，提供防御性复制、脱敏与清零。
ProviderSpec.java: 不含密钥的 provider 写 command，固定 endpoint 与 timeout 校验。
ManagedModelSpec.java: 模型写 command，约束 alias、上游标识、窗口、排序和 default sentinel 边界。
ModelGrantSpec.java: 授权写 command，封装模型、主体、默认与状态事实。
ProviderProbe.java: provider `/models` 最小探测端口和仅含分类/延迟的脱敏结果。
JdkProviderProbe.java: JDK HttpClient 无重定向探测 adapter，不读取或返回上游正文。
ProviderChangeMetadata.java: PROVIDER_CHANGED 审计 metadata 白名单。
ManagedModelChangeMetadata.java: MODEL_CHANGED 审计 metadata 白名单。
ModelGrantChangeMetadata.java: MODEL_GRANT_CHANGED 审计 metadata 白名单。
ModelResourceNotFoundException.java: 模型纵向资源不存在的稳定领域异常。
ProviderService.java: provider CRUD 子集、秘密加解密、CAS/bootstrap revision/审计事务与测试编排。
ManagedModelService.java: 模型 CRUD/排序/启停的 CAS/bootstrap revision/审计事务编排，删除达到目标状态后可安全重放。
ModelGrantService.java: 单条/批量授权、默认冲突、主体校验、CAS/幂等删除和原子审计编排。
EffectiveModelResolver.java: 用户与当前部门授权并集、USER 默认优先及 sort fallback 的纯裁决器。
BootstrapUser.java: runtime bootstrap 所需的当前 RuoYi 用户最小事实。
BootstrapService.java: ACTIVE 设备/用户/revision/有效模型组合查询，不承载 T09/T13/T16 业务。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
