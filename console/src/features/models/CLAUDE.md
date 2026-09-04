# models/

> L2 | 父级: ../CLAUDE.md

成员清单

model-catalog.tsx: 通过 OpenAPI operation、TanStack Query、浏览器 UUID 幂等键与 Server revision 管理 Provider/受管模型/模型集，并把每个供应商唯一的 PROVIDER RATE 策略聚合为上游容量。
model-editors.tsx: Provider 与受管模型纯表单层；供应商表单同时收集共享 RPM/并发，模型表单以“模型 ID”呈现 alias 并忠实收集三协议、十进制容量、reasoningEfforts 与 compat。
model-set-management.tsx: 通过生成 operation、TanStack Query/Form 和产品表格管理扁平模型集；成员仍写受管模型 ID，选择器与摘要以“供应商 / 模型 ID”区分同名上游模型。
token-capacity.ts: 将 Harness 十进制 K/M 容量格式转换为 Server 正整数 Token 契约。
token-capacity.test.ts: 锁定 256K=256000、1M=1000000 的容量语义门禁。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
