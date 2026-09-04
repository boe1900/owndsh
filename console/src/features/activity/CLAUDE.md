# activity/

> L2 | 父级: ../CLAUDE.md

成员清单

activity-page.tsx: 以独立 ent:usage:read 及其它 console 权限裁剪用量、审计和插件运行异常分段；V1 不构造 Session 查询或管理入口。
activity-page.test.ts: 锁定权限到 V1 活动分段的最小映射，证明 auditor 和 specialist 视图不会扩张 mutation 权限且 Session 保持隐藏。
session-content.ts: 在 React 状态前严格验证 Base64、UTF-8、JSONL、事件 envelope 与连续序号，只输出页面所需事件投影。
session-content.test.ts: 覆盖规范正文及非规范 Base64、范围和事件拒绝路径。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
