# application/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteTicketRequest.java: 控制端请求 ticket 的外部输入校验，绑定 controller identity、能力和版本。
RemoteControlService.java: 员工本人设备与安装资格、Host 首次公钥 pin、ticket 幂等签发和消费；续租/业务转发重验当前源/目标所有权、状态、能力及 READY Host 公钥，Peer 关闭清除 presence。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
