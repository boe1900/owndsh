# auth/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

login.html: 公开认证页面骨架，承载身份源选择、LOCAL 首次改密/验证码、LDAP 表单和 OIDC 跳转，不加载管理端应用。
login.css: 公开认证页的响应式布局、首次改密提示、验证码稳定尺寸、焦点状态与受控企业视觉样式。
login.js: 只在页面内存持有 transaction/CSRF/captcha，首次改密 303 返回后恢复 LOCAL 表单并在原生 HTTPS 提交前校验新密码。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
