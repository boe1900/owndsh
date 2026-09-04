# application/

> L2 | 父级: ../CLAUDE.md

成员清单

DeviceAccessException.java: client/device 类型或 ACTIVE 状态失败的稳定访问异常，只允许冻结错误码。
DeviceBindingConflictException.java: tenant 内 installation 已属于其他用户时返回 ENT_DEVICE_ALREADY_BOUND，禁止隐式转移 owner。
DeviceCallContext.java: 聚合固定 tenant、可信 PlatformSession 与脱敏审计关联数据。
DeviceEnrollment.java: Runtime enroll 的 UUID v4 installation、显示名、平台及版本不变量。
DeviceEnrollmentMetadata.java: DEVICE_ENROLLED 审计只记录平台和首次创建事实。
DeviceHeartbeat.java: Runtime heartbeat 的版本、revision、插件摘要与 Session 积压白名单输入。
DeviceHeartbeatMetadata.java: DEVICE_HEARTBEAT 审计的 revision/积压/同步状态投影。
DeviceNotFoundException.java: tenant 限定设备不存在边界，不泄漏其他 tenant 事实。
DeviceService.java: 单事务设备状态与审计编排；heartbeat 由 store 原子限频，revoke 提交后按 installation 幂等吊销 Access/Refresh Session。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
