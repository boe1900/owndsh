# domain/

> L2 | 父级: ../CLAUDE.md

成员清单

SessionReplica.java: owner/source device 绑定、官方 format v0、滚动 hash、密文 header/title 和 tombstone 状态的聚合事实。
SessionEventRecord.java: 单条精确 raw JSON event line 的 AES-GCM 密文与逐事件 rolling-hash checkpoint。
SessionReplicationBatch.java: 幂等键、连续范围、payload hash 与已确认 rolling hash 的持久化结果。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
