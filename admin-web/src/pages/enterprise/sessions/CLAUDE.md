# sessions/

> L2 | 父级: ../CLAUDE.md

成员清单

index.tsx: 管理 Session metadata cursor 表、独立正文权限时间线与 ACTIVE tombstone 删除入口；正文逐页解码且不进入持久状态。
index.test.tsx: 验证 metadata 呈现、正文/删除权限裁剪、已知与未知事件时间线及删除刷新行为。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
