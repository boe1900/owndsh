# session-sync/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: Session 客户端边界说明，限定 T01 只验证新 ID seed 恢复与持久化检查点。
package.json: 私有 workspace package 清单，无 Harness 源码依赖地公开结构化 Session port。
tsconfig.json: Node TypeScript 构建边界，从 `src/` 生成 ESM 与声明。
src/index.ts: 目标 cwd、新 ID、seed lineage 与 flush 的恢复事务辅助函数。
tests/restore.spec.ts: 成功恢复、输入拒绝和 create 失败不触发 flush 的 Vitest 验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
