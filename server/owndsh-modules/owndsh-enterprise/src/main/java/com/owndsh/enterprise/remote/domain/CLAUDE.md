# domain/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteDeviceSnapshot.java: Remote 设备与 presence 的脱敏只读聚合，承载连接资格和能力摘要。
RemoteTicket.java: 保持管理 API 五字段响应与 ICE server 投影，不含登录凭据。
EmployeeRemoteTicket.java: 员工 ticket 六字段投影，将已 pin 的 Host 公钥与一次性建链授权一起交付。
RemoteTicketState.java: Redis ticket/link 绑定 owner、源 installation、目标设备及双方公钥，供消费、续租和撤权校验。
RemoteControlException.java: Remote 控制面稳定拒绝错误码，交给统一 HTTP 错误边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
