# auth/

> L2 | 父级: ../CLAUDE.md

成员清单

session.ts: 以服务端 HttpOnly Cookie 为唯一认证事实，提供 bootstrap 单飞缓存、同源注销和本人改密；不读取、保存、注入或跨标签复制 Token。
pkce.ts: 以一次性 sessionStorage state/verifier 和同源 returnTo 完成 S256/Cookie 交换；本次新鲜登录成功后只续授保存的原客户端事务，普通浏览器登录保留内部返回路径。
pkce.test.ts: 验证 HTTP 环境 S256/RFC 向量、一次性交换和安全返回路径，以及新鲜登录续授原事务、失败不续授、事务替换及非法回调拒绝。

auth-layout.tsx: 登录、账号确认与授权交接共用品牌布局，凭据表单只留在 login。
browser.ts: 共用浏览器账号查询及客户端授权提交，绑定服务端账号与事务 CSRF，统一映射 401 并只允许 IPv4 loopback 回调；供新鲜登录与显式确认共用。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
