# enterprise/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

RuoYiCaptchaVerifier.java: 复用既有验证码开关、Redis key 和失败登录记录，为 LOCAL 登录原子消费一次性验证码。
RuoYiPlatformSessionGateway.java: 平台会话 composition adapter，按 userId 组装完整 RBAC LoginUser，签发 12 小时非共享 client/device Sa-Token，并按 terminal 精确撤销单台 Harness 设备。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
