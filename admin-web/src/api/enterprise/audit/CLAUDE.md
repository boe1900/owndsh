# audit/

> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: 包装生成的 audit cursor operation，按 action 校验 metadata key 并把值投影为只读标量。
index.test.ts: 验证筛选透传、requestId 双记录和敏感/未知 metadata 字段拒绝。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
