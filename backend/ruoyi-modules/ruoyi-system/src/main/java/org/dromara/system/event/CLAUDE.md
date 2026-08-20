# event/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

OnlineUserCleanEvent.java: 权限变化后的在线用户缓存清理事实。
OssConfigChangeEvent.java: OSS 配置缓存刷新事实。
UserGovernanceChangedEvent.java: 用户角色替换和状态变化的脱敏事务事实，供企业审计在提交前消费。
UserGovernanceEventPublisher.java: 读取事务内最终角色数量并发布脱敏用户治理事实，使用户聚合服务不承担审计接缝细节。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
