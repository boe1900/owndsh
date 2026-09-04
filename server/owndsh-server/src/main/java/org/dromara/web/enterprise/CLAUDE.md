# enterprise/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

AdminSessionCookieFilter.java: 管理端认证前置 Filter，只在 `/enterprise/admin/**` 将固定 HttpOnly Cookie 写入 Sa-Token 请求存储，保证权限注解先于 Controller 执行时也能读取会话。
OwnDshCaptchaVerifier.java: 复用既有验证码开关、生成端默认 Redis codec、全局 key 和失败登录记录，为 LOCAL 登录原子消费一次性验证码。
OwnDshPlatformSessionGateway.java: 平台会话 composition adapter，签发 12 小时非共享 client/device Sa-Token；保留固定管理端 Cookie 的 Controller 内兜底读取，Desktop Bearer、设备撤销和 kickout 语义不变。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
