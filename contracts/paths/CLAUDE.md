# paths/

> L2 | 父级: ../CLAUDE.md

成员清单

auth.yaml: authorize/身份验证/Desktop Token/管理端 HttpOnly Cookie/logout、当前用户改密与 bootstrap Path Item；两类客户端不共享 Token 响应，改密撤销全部会话。
device.yaml: T05 Runtime enroll/heartbeat 与管理员 list/get/revoke 五个设备 Path Item，保持 Token terminal 与 revision 权限边界。
identity.yaml: 身份源、LDAP 用户/组发现与单人导入、扁平产品用户组和外部组映射 Path Item，保留 revision、来源隔离、权限码和脱敏边界。
member.yaml: LOCAL 成员幂等创建及产品成员 cursor/list/detail、状态、固定角色、身份解绑与绑定事务 operation，保持 read/write 权限、revision CAS 和新鲜认证边界。
model.yaml: T08/P2-08A provider/model/model set/grant 管理与 ACTIVE 设备 bootstrap operation，保持幂等键、revision、集合资源和脱敏边界。
quota.yaml: T09/P2-08A quota CRUD/状态/四窗口、本人用量及管理员 ledger operation，保持资源范围、ACTIVE 设备和 prompt-free 边界。
gateway.yaml: T10/T11 Completions、Responses、Anthropic Messages 三个原生 SSE operation 与首字节前错误矩阵。
plugin.yaml: T13 六个管理与三个 runtime operation，冻结 multipart、revision、权限、逐请求授权及单 Range 边界。
session.yaml: T16 三个管理与五个 runtime operation，冻结设备源绑定、正文独立权限、导出 hash 与 tombstone 边界。
audit.yaml: T19 单一管理只读 operation，冻结九维筛选、cursor 和 ent:audit:read 权限边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
