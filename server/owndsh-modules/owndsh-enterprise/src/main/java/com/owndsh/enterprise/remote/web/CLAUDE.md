# web/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteController.java: 管理诊断 API 复用管理员会话/权限，ticket 仍必须属于当前用户。
EmployeeRemoteController.java: 员工 Bearer 的本人其他设备列表与安全 ticket，cursor 同时绑定用户和源 installation。
RemoteDeviceView.java: 设备列表与 capability 的脱敏响应投影。
RemoteLeaseView.java: lease 撤权结果投影，不暴露 Redis epoch 和 owner。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
