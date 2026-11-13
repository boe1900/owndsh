# paths/

> L2 | 父级: ../CLAUDE.md

成员清单

auth.yaml: authorize/HTTP(S) 身份验证、浏览器账号与原桌面事务授权决定、Desktop code/refresh Token、浏览器 HttpOnly Cookie/logout、当前用户改密与 bootstrap Path Item；两类客户端不共享 Token 响应，改密撤销全部会话，设备撤销后的 logout 固定返回 403 ENT_DEVICE_REVOKED。
device.yaml: T05 Runtime enroll/heartbeat 与管理员 list/get/revoke 五个设备 Path Item，保持 Token terminal 与 revision 权限边界。
identity.yaml: 身份源、LDAP 用户/组发现与单人导入、扁平产品用户组和外部组映射 Path Item，保留 revision、来源隔离、权限码和脱敏边界。
member.yaml: LOCAL 成员幂等创建及产品成员 cursor/list/detail、状态、固定角色、身份解绑与绑定事务 operation，保持 read/write 权限、revision CAS 和新鲜认证边界。
model.yaml: T08/P2-08A provider/model/model set/grant 管理与 ACTIVE 设备 bootstrap operation，授权为资源 × 主体类型的多主体策略；Provider/Connection 删除保持无子项约束、CAS、集合资源和脱敏边界。
quota.yaml: T09/P2-08A quota CRUD/状态/四窗口、本人用量及管理员最新优先 ledger operation，保持资源范围、ACTIVE 设备和 prompt-free 边界。
gateway.yaml: T10/T11 Completions、Responses、Anthropic Messages 三个原生 SSE operation 与首字节前错误矩阵。
plugin.yaml: 七个管理与一个 runtime operation；发布可携带旧版 ID 和包 revision，与 If-Match 的版本 revision 一起保护原子发布/范围迁移，省略请求体仅发布；包/单版本删除使用包 revision，清理关联范围，宿主安装事实保持独立；保留 JSON 登记、范围与设备授权目录。
skill.yaml: 两个 runtime 与五个管理 operation，提供脱敏 release catalog、公开源码导入、草稿登记、CAS 发布/撤销和制品下载；不提供 assignment/inventory。
mcp.yaml: MCP 配置/授权 CRUD 与 assignment/catalog operation；授权启停/删除统一 If-Match、400/404/409 和 Cookie 权限边界。
session.yaml: T16 三个管理与五个 runtime operation，冻结设备源绑定、正文独立权限、导出 hash 与 tombstone 边界。
audit.yaml: T19 单一管理只读 operation，冻结九维筛选、最新优先时间/ID cursor 和 ent:audit:read 权限边界。
remote.yaml: 管理诊断、Harness Bearer 和 Console Cookie 的本人设备/ticket/连接快照与准确断开；Harness 绑定源 installation，Console 绑定登录且仅作 controller，共用可信 Host 公钥、分页和幂等边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
