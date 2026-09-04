# web/

> L2 | 父级: ../CLAUDE.md

成员清单

SessionBatchRequest.java: 连续范围、精确 payload、hash、首批完整官方 SessionHeader 与可选 title 的上传 DTO。
SessionRestoreRecordRequest.java: 本地新副本创建成功后的源/目标关联审计 DTO。
SessionViews.java: runtime 本人标题投影、admin 纯 metadata 投影、导出页与 tombstone 成功载荷。
RuntimeSessionController.java: ACTIVE Harness 设备的 append/list/export/delete/restore-record 入口。
AdminSessionController.java: `ent:session:*` 三个独立权限保护的 metadata/content/delete 入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
