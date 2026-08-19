# session/

> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: Session 管理业务协议边界，保留 metadata cursor，严格解码正文 JSONL 为最小事件投影并封装 tombstone 删除。
index.test.ts: 验证精确 LF JSONL 解码、范围连续性、坏 payload 拒绝与删除请求参数。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
