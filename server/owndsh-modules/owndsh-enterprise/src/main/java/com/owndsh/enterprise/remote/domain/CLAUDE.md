# domain/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteDeviceSnapshot.java: Remote 设备与 presence 的脱敏只读聚合，承载连接资格和能力摘要。
RemoteTicket.java: 保持管理 API 五字段响应与 ICE server 投影，不含登录凭据。
EmployeeRemoteTicket.java: Harness/Console 本人 ticket 六字段投影，将已 pin 的 Host 公钥与一次性建链授权一起交付。
RemoteTicketState.java: Redis ticket/link 以 ControllerKind 区分 Harness installation 与 Console 登录会话，绑定 owner、目标和双方公钥；旧无 kind 状态默认为 HARNESS。
RemoteControlException.java: Remote 控制面稳定拒绝错误码，交给统一 HTTP 错误边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
