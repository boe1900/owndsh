# auth/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

login.html: T05 公开认证页面骨架，承载身份源选择、LOCAL 条件验证码、LOCAL/LDAP 表单和 OIDC 跳转，不加载管理端应用。
login.css: 公开认证页的响应式布局、验证码稳定尺寸、焦点状态与受控企业视觉样式。
login.js: 只在页面内存持有 transaction/CSRF/captcha ID，切换身份源时清空凭据，LOCAL 复用 `/auth/code` 并使用原生表单或浏览器跳转完成认证。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
