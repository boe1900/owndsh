# auth/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

login.html: 公开认证页面骨架，互斥承载初始凭据与一次性 challenge 新密码步骤，并提供 LOCAL 验证码、LDAP 与 OIDC 入口。
login.css: 公开认证页的响应式布局、首次改密提示、验证码稳定尺寸、焦点状态与受控企业视觉样式。
login.js: 只在页面内存持有 transaction/CSRF/captcha/challenge，以 JSON 页面步骤清空初始凭据、原位提示认证错误、轮换弱密码 challenge 并导航精确回调。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
