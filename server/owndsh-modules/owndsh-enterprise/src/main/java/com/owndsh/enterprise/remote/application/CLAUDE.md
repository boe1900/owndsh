# application/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteTicketRequest.java: 控制端请求 ticket 的外部输入校验，绑定 controller identity、能力和版本。
RemoteControlService.java: Harness 安装与 Console 登录的本人设备/ticket 授权，Console 本人设备 guard 与准确 link 的 Redis 撤销供 Gateway 组合；Console 只当 controller；消费匹配来源、续租/转发重验目标所有权、状态、能力及 READY Host pin，浏览器有效性由 Gateway 的 SESSION_ACTIVE 逐帧/定时重验。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
