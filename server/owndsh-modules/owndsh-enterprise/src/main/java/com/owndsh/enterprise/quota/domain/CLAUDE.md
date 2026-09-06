# quota/domain/

> L2 | 父级: ../CLAUDE.md

成员清单

QuotaSubjectType.java: ORGANIZATION/MEMBER 生效作用域封闭枚举，部门不参与限额裁决。
QuotaPolicyType.java: TOKEN/RATE 策略判别真源，累计 Token 窗口与瞬时 RPM/并发不可混填。
QuotaResourceType.java: ALL_MODELS/MODEL_SET/MODEL/PROVIDER 资源范围封闭枚举，供应商仅用于组织级 RATE。
QuotaStatus.java: quota policy ACTIVE/DISABLED 状态真源。
QuotaWindowType.java: 连续 FIVE_HOURS 与自然 DAY/WEEK/MONTH Token 窗口类型。
ReservationState.java: SENT 表示已持久化发送尝试，明确拒绝可释放；发送结果未知仍保留计量事实。
UsageResult.java: SETTLED 表示已知 usage，CHARGED_MAX 表示未知 usage 与估算扣额。
QuotaPolicy.java: 带 TOKEN/RATE 互斥及组织级 PROVIDER 约束、主体/资源投影、窗口锚点和 revision 的受管策略聚合。
QuotaWindow.java: PostgreSQL 锁定窗口的非负 used/reserved 计数事实。
ReservedWindow.java: reservation 固化的窗口、策略、类型和预留量快照。
UsageReservation.java: 幂等键、requestId、状态、窗口快照和恢复期限的不可变预留事实。
UsageLedger.java: 不含 prompt 的实测 Token 分类、独立 chargedTokens 和计量结果；未知分类为零且由 result 明示未知。
UsageLedgerMetadata.java: 组合不可变账本与当前用户/部门/模型显示语义的只读管理投影，不参与计费。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
