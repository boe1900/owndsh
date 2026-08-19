# plugin/application/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginMutationContext.java: 管理写事务的可信 tenant/actor/request 审计上下文。
PluginAuditMetadata.java: 五类插件审计 action 的非敏感 metadata 白名单。
PluginResourceNotFoundException.java: 插件 package/version 不存在的稳定领域异常。
PluginAccessException.java: runtime assignment 下载授权失败的稳定异常。
EffectivePluginResolver.java: USER→DEPT→ALL 生效优先级的唯一应用入口。
PluginCatalogService.java: 上传、幂等自然键、发布、退休、assignment replace、revision 与审计事务编排。
PluginRuntimeService.java: ACTIVE 设备分配读取、逐请求下载授权和 inventory 替换事务编排。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
