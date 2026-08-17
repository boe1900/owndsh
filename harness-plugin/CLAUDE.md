# harness-plugin/

> L2 | 父级: ../CLAUDE.md

成员清单

README.md: 企业 Harness 插件独立 pnpm workspace 说明，冻结与上游 Harness 一致的工具链边界并约束后续包只依赖公开扩展点。
package.json: workspace 根清单，固定 Node/pnpm 版本并统一暴露 build、typecheck、test 与 check 门禁。
pnpm-lock.yaml: 空 workspace 的锁定依赖图，固定 pnpm lockfile 格式并为后续包提供单一依赖真源。
pnpm-workspace.yaml: workspace 成员边界，只接纳 `packages/*` 下的企业插件包。
workspace.test.mjs: T00 workspace 不变量测试，校验工具链与锁定 Harness 一致且当前阶段没有越界业务包。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
