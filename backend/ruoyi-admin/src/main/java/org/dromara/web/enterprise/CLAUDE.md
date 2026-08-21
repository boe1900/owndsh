# enterprise/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

RuoYiCaptchaVerifier.java: 复用既有验证码开关、生成端默认 Redis codec、全局 key 和失败登录记录，为 LOCAL 登录原子消费一次性验证码。
RuoYiPlatformSessionGateway.java: 平台会话 composition adapter，签发 12 小时非共享 client/device Sa-Token；设备撤销以服务端 Token Session 标记加精确 kickout 保留原因，普通 logout/kickout 仍保持认证失败语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
