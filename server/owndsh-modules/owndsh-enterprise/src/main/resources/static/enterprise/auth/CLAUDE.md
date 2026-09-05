# auth/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

login.html: 公开认证页面骨架，以左上鲸鱼品牌和居中卡片互斥承载初始凭据与一次性 challenge，并分离密码源 Tab 与 OIDC 入口。
login.css: 公开认证页对齐 Console Beautiful UI 的冷灰 token、单列居中卡片、8px 控件、身份源 Tab、首次改密提示、验证码稳定尺寸与焦点状态。
login.js: 只在页面内存持有 transaction/CSRF/captcha/challenge，以默认密码源和可切换 Tab 驱动既有认证状态机，清空初始凭据、轮换弱密码 challenge 并导航精确回调。
owndsh-whale-mono-m2-animated.png: 复用插件登录页的 512×512 循环 APNG，用作公开登录页左上角 OwnDsh 品牌标识。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
