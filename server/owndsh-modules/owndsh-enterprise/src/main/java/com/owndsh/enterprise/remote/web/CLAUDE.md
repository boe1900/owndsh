# web/

> L2 | 父级: ../CLAUDE.md

成员清单

RemoteController.java: Remote P0 管理 API 入口，复用管理员会话、权限、cursor 和统一响应。
RemoteDeviceView.java: 设备列表与 capability 的脱敏响应投影。
RemoteLeaseView.java: lease 撤权结果投影，不暴露 Redis epoch 和 owner。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
