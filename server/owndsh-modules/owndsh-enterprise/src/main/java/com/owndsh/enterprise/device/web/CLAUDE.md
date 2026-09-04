# web/

> L2 | 父级: ../CLAUDE.md

成员清单

AdminDeviceController.java: enterprise-admin client 与 ent:device 权限双重保护的 cursor list/get/revoke 管理入口。
DeviceEnrollRequest.java: enroll JSON 到校验后 DeviceEnrollment 的协议翻译 DTO。
DeviceHeartbeatRequest.java: heartbeat JSON 到白名单 DeviceHeartbeat 的协议翻译 DTO。
DeviceRequestContextResolver.java: Servlet 请求到可信 DeviceCallContext 的 DIP 端口。
DeviceView.java: snowflake ID 字符串化并暴露脱敏 heartbeat 摘要、但不暴露 tenant/Token 的设备响应投影。
RuntimeDeviceController.java: dsh-desktop Token 专属 enroll/heartbeat 入口，忽略 X-Device-Id 等客户端授权声明。
OwnDshDeviceRequestContextResolver.java: 从固定 tenant、当前 Sa-Token session 和统一请求 metadata 构建设备上下文，并把 adapter 明确识别的撤销 Token 翻译为 ENT_DEVICE_REVOKED。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
