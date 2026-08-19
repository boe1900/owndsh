# plugin/

> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: 包装插件 catalog、上传、发布、退休、全量 assignment 替换和设备 inventory operation，集中幂等键与 revision CAS。
index.test.ts: 验证上传和 assignment 写操作的幂等键、版本/package revision header 不被页面绕过。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
