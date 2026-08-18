# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

t01-harness-smoke.mjs: T01/T06 真实组合验收器，先断言 Harness 锁定 commit 与清洁度，再安装 bundle tgz 到临时 consumer/profile，验证 Web、本地 API/SSE、installation、Client/Session seed 与上游清洁度。
t02-contract-consumer.mjs: T02 真实包验收器，把 contracts tgz 安装到全新临时 consumer，验证公开 ESM、品牌构造、严格错误解码和协议 hash。
t06-platform-client-consumer.mjs: T06 真实包验收器，安装 platform-client/contracts tgz 后验证 built-lib 导入、非秘密 installation 与无 ambient/Harness 源码依赖。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
