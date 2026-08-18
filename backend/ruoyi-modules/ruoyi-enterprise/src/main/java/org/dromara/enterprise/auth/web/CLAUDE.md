# web/

> L2 | 父级: ../CLAUDE.md

成员清单

AdminGroupMappingController.java: 外部组映射 cursor list/create/delete 管理入口，统一 ent:identity 权限与 revision/idempotency headers。
AdminIdentitySourceController.java: 身份源 cursor list/get/create/update/test/enable/disable 管理入口，只返回脱敏 view。
DeletedResourceView.java: CAS 删除成功的 id/deleted 白名单 DTO。
EnterpriseRequestContext.java: 服务端固定 tenant、Sa-Token actor 与脱敏请求关联信息。
GroupMappingCreateRequest.java: 字符串 snowflake ID 输入解析和外部组写 DTO。
GroupMappingView.java: 外部组映射公开管理字段投影。
IdentityAdminRequestContextResolver.java: Controller 到可信管理请求上下文的 DIP 端口。
IdentitySourceView.java: 隔离 encryptedSecret、只公开 secretConfigured 的身份源响应投影。
IdentitySourceWriteRequest.java: 一次性 char[] secret、显式清零与脱敏字符串输出的写 DTO。
RuoYiIdentityAdminRequestContextResolver.java: 从固定部署 tenant、RuoYi 会话与 Servlet 元数据构造管理请求上下文。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
