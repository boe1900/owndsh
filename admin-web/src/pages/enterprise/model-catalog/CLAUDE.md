# model-catalog/

> L2 | 父级: ../CLAUDE.md

成员清单

index.tsx: Provider/受管模型双视图工作台，配置 Harness 三种 wire API、模型发现、K/M Token 容量、reasoningEfforts 三态/七档 wire 映射及 completions compat，并执行 CRUD、排序与 CAS 启停。
tokenCapacity.ts: 受管模型容量的表单边界适配器，以 Harness 的十进制语义解析/格式化 K/M 文本并保持 OpenAPI 整数契约。
tokenCapacity.test.ts: K/M 容量文本、整数回显、空值和非法范围的纯函数回归门禁。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
