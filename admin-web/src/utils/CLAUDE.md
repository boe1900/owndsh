# utils/

> L2 | 父级: ../../CLAUDE.md

成员清单

auth.ts: enterprise-admin 固定 client、标签页 Token 与认证 header 唯一事实入口。
crypto.ts: Web Crypto 随机源与 crypto-js AES/Base64 的 RuoYi 请求兼容层。
dict.ts: 系统字典数据到 Ant Design 选项的纯展示适配器。
download.ts: 统一请求、Blob 协议校验、本地文件保存与 Object URL 释放边界。
env.ts: Umi/Vite 公开环境变量只读视图，不承载平台 Token 或服务端 secret。
jsencrypt.ts: 使用公开环境 RSA key 的 RuoYi 字段加解密兼容层。
menu.tsx: 服务端 BackendRoute 到动态图标、菜单树和 Umi 路由的适配边界。
messageRead.ts: 按用户隔离的本地消息已读 ID 状态，不保存消息正文。
modal.ts: Promise 化确认框与取消安全包装，供破坏性业务动作复用。
ossContent.ts: 正文 oss:// 引用到授权 URL 的批量容错解析边界。
permission.ts: 服务端权限码/角色事实的客户端展示裁剪助手，不替代授权。
push.ts: 复用 enterprise-admin 认证事实的消息盒与 SSE/WebSocket 生命周期。
pushMessage.ts: 推送消息容错解析、收件箱过滤、语义分组与标题解析纯函数。
queryClient.ts: TanStack Query 全局缓存、重试、焦点刷新和 staleTime 策略真源。
ruoyi.ts: 上游 RuoYi 查询、日期、分页、排序、树与 Blob 协议兼容工具集。
sanitize.ts: 基于显式 tag/attribute/style/URL 白名单的富文本展示安全边界。
upload.ts: 浏览器文件扩展名、MIME、名称与大小的上传前置校验工具。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
