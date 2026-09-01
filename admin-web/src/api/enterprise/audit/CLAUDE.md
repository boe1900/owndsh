# audit/

> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: 包装生成的 audit cursor operation，按封闭 action 校验 metadata key，包含成员身份解绑 revision 事实。
index.test.ts: 验证筛选透传、requestId 双记录和敏感/未知 metadata 字段拒绝。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
