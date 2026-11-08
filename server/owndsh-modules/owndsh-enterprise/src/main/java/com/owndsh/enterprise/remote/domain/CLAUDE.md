# domain/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteDeviceSnapshot.java: Remote 设备与 presence 的脱敏只读聚合，承载连接资格和能力摘要。
RemoteTicket.java: 一次性 ticket 的公开响应值与 ICE server 投影，不含登录凭据。
RemoteTicketState.java: Redis 中短期 ticket/link 授权绑定事实，供消费和撤权校验。
RemoteControlException.java: Remote 控制面稳定拒绝错误码，交给统一 HTTP 错误边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
