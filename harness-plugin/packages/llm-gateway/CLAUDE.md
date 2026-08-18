# llm-gateway/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 模型网关客户端边界说明，限定 T01 只验证 OpenAI-compatible SSE 传输语义。
package.json: 私有 workspace package 清单，无运行依赖地公开 SSE frame 解码接口。
tsconfig.json: Web Streams TypeScript 构建边界，从 `src/` 生成 ESM 与声明。
src/index.ts: 增量 SSE frame 解析、错误分类、断流和取消实现。
tests/sse.spec.ts: 分块、错误 frame、非 2xx、断流和 AbortSignal 的 Vitest 验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
