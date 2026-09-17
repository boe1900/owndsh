# plugin/application/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginMutationContext.java: 管理写事务的可信 tenant/actor/request 审计上下文。
PluginAuditMetadata.java: 五类插件审计 action 的非敏感 metadata 白名单。
PluginResourceNotFoundException.java: 插件 package/version 不存在的稳定领域异常。
PluginAccessException.java: 目录与库存接口拒绝失效身份的稳定异常。
EffectivePluginResolver.java: bootstrap 与安装前目录复查共用 USER→DEPT→ALL 生效优先级。
PluginCatalogService.java: 同包事务锁下按版本幂等登记配置、发布/退休与可见范围 replace，保持 revision/审计原子性。
PluginRuntimeService.java: ACTIVE 设备授权目录与库存替换；服务端不下载或持有插件包。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
