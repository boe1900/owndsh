# enterprise/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

AdminSessionCookieFilter.java: 浏览器认证前置 Filter，在 `/enterprise/admin/**` 和 `/enterprise/console/**` 将外部 HTTP(S) 地址对应的 HttpOnly Cookie 写入 Sa-Token 请求存储，保证 Controller/权限注解都能读取会话。
OwnDshCaptchaVerifier.java: 复用既有验证码开关、生成端默认 Redis codec、全局 key 和失败登录记录，为 LOCAL 登录原子消费一次性验证码。
OwnDshPlatformSessionGateway.java: 平台会话适配器，签发 12 小时非共享 Sa-Token，终端信息缺失时返回认证错误，负责浏览器、设备及成员维度的 Access 与 Refresh Session 撤销。
OwnDshRemotePeerAuthenticator.java: Remote Upgrade/持续重验的 Sa-Token adapter，传递 Harness installation 或 enterprise-admin Console 登录事实，拒绝 client/console 不匹配，不泄露 Token。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
