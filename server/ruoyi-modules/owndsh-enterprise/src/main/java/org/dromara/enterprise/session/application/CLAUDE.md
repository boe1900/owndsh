# application/

> L2 | 父级: ../CLAUDE.md

成员清单

SessionActorContext.java: 管理读取/删除的可信 actor、requestId 与脱敏请求元数据边界。
SessionAuditMetadata.java: 六类 Session 审计 action 的显式无正文 metadata 白名单。
SessionBatchUpload.java: Web 到 parser 的未信任 Base64/header/title 原始命令，不混入服务端 actor 事实。
SessionBatchParser.java: canonical Base64、JSONL 精确字节、事件 envelope、payload SHA-256 与 rolling hash 的输入闸门。
SessionException.java: Session 格式、容量、序列、分叉、设备冲突与正文 tombstone 的封闭稳定错误。
SessionService.java: ACTIVE 设备 append/本人查询及管理正文权限、删除、恢复记录和 retention 的短事务编排。
SessionRetentionJob.java: 每日触发 90 天正文清除，调用同一 SessionService tombstone 与审计路径。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
