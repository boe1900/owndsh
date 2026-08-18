# paths/

> L2 | 父级: ../CLAUDE.md

成员清单

auth.yaml: T05 authorize/sources/password/OIDC/token/logout 七个公开认证 Path Item，LOCAL password 复用现有验证码，所有共享参数、响应和 schema 回指协议根。
device.yaml: T05 Runtime enroll/heartbeat 与管理员 list/get/revoke 五个设备 Path Item，保持 Token terminal 与 revision 权限边界。
identity.yaml: T04 身份源与组映射十个管理 Path Item，保留 revision CAS、权限码和脱敏响应边界。
model.yaml: T08 provider/model/grant 十九个管理 operation 与一个 ACTIVE 设备 bootstrap operation，保持幂等键、revision 和脱敏边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
