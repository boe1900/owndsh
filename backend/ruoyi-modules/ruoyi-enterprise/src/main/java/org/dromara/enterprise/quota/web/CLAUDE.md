# quota/web/

> L2 | 父级: ../CLAUDE.md

成员清单

QuotaPolicyWriteRequest.java: 管理协议到 nullable quota policy spec 的严格转换 DTO。
QuotaPolicyView.java: subject 投影、独立限额、状态与 revision 的管理输出。
QuotaWindowView.java: 当前自然窗口 limit/used/reserved/reset 的只读输出。
DeletedQuotaPolicyView.java: quota policy 删除成功的 id/deleted 投影。
AdminQuotaController.java: `/enterprise/admin/v1/quotas` CRUD/启停/窗口与 ent:grant 权限入口。
MyQuotaUsageView.java: 员工有效策略的日/月、RPM 与并发实时计数输出。
RuntimeUsageController.java: ACTIVE dsh-desktop owner 与 ACTIVE 用户双重校验的 `/enterprise/api/v1/usage/me` 入口。
UsageLedgerView.java: prompt-free 终态 ledger 输出。
UsageLedgerPageView.java: ledger items/cursor 与全筛选聚合输出。
AdminUsageController.java: 用户/部门/模型/canonical requestId/时间筛选的 `/enterprise/admin/v1/usage` 入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
