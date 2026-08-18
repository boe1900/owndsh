# quota/domain/

> L2 | 父级: ../CLAUDE.md

成员清单

QuotaSubjectType.java: DEFAULT/DEPT/USER 生效作用域封闭枚举。
QuotaStatus.java: quota policy ACTIVE/DISABLED 状态真源。
QuotaWindowType.java: 自然 DAY/MONTH Token 窗口类型。
ReservationState.java: RESERVED/SENT 到三个终态的计费状态机真源。
UsageResult.java: ledger 只允许 SETTLED 或 CHARGED_MAX 计费结果。
QuotaPolicy.java: 带 nullable 独立限额、subject 投影和 revision 的受管策略聚合。
QuotaWindow.java: PostgreSQL 锁定窗口的非负 used/reserved 计数事实。
ReservedWindow.java: reservation 固化的窗口、策略、类型和预留量快照。
UsageReservation.java: 幂等键、requestId、状态、窗口快照和恢复期限的不可变预留事实。
UsageLedger.java: 不含 prompt 的终态 Token 分类与 requestId 账本事实。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
