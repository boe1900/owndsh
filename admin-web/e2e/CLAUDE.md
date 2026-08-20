# e2e/

> L2 | 父级: ../CLAUDE.md

成员清单

admin-console.spec.ts: 真实 HTTPS/Server 串行完成 T12 治理及 T15 tgz 上传、发布、全量分配、CAS 恢复、旧版本回滚、退休和 inventory；复用 support 认证夹具并输出桌面快照。
audit-pages.spec.ts: 真实模型网关 requestId 驱动 accepted/finished 双审计、metadata 白名单及 auditor/employee 权限页面闭环。
session-pages.spec.ts: 真实 Session batch 驱动管理员正文/删除、审计员只读、员工拒绝与 tombstone 页面闭环。
support/: 真实 Server 验收所需的本地 HTTPS 边界与受控外部服务；局部地图见 support/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
