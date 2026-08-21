# plugins/

> L2 | 父级: ../CLAUDE.md

成员清单

v1/: `@enterprise-agent/candidate-tools` 1.0.0 旧版本源码，作为管理员回滚目标。
v2/: `@enterprise-agent/candidate-tools` 1.1.0 新版本源码，作为客户端首次安装目标。

两个版本保持同一 package/bundle row，只改变公开版本常量；row 按 Harness 官方 bundle 约定通过 package 名解析显式 `main/exports`，T22 编排器从这些只读源码分别执行 `pnpm pack`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
