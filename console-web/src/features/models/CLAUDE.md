# models/

> L2 | 父级: ../CLAUDE.md

成员清单

model-catalog.tsx: 通过 OpenAPI operation、TanStack Query、浏览器 UUID 幂等键与 Server revision 管理 Provider/受管模型，目录列表只展示客户端请求使用的模型 ID，上游模型 ID 留在编辑器。
model-editors.tsx: Provider 与受管模型纯表单层，以“模型 ID”呈现底层 alias，并忠实收集三协议、十进制容量、reasoningEfforts 三态七档与 compat，不承担请求发送。
token-capacity.ts: 将 Harness 十进制 K/M 容量格式转换为 Server 正整数 Token 契约。
token-capacity.test.ts: 锁定 256K=256000、1M=1000000 的容量语义门禁。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
