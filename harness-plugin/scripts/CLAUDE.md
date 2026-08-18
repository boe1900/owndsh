# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

t01-harness-smoke.mjs: T01 真实组合验收器，先断言 Harness 锁定 commit 与清洁度，再把 bundle tgz 安装到临时 package consumer 和 `web` profile，启动 Web、调用本地 API/Session seed 路由并复核上游清洁度。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
