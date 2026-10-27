# models/

> L2 | 父级: ../CLAUDE.md

成员清单

model-catalog.tsx: 通过生成 OpenAPI operation、TanStack Query 和 ProductDataTable 提供“模型与供应商”统一工作台；拓扑视图按 Provider→Connection→ManagedModel 展示，模型表视图复用扁平列表，模型按 connectionId 路由，并复用 Provider ID 的确定性渐变。
model-editors.tsx: Provider 元信息、连接 endpoint/API key、统一模型维护表单与删除确认；维护表单载入连接已有模型并区分更新/新建保存，支持模型发现、手动维护、配置展开和视口内滚动，内部 providerKey、alias 不进入用户输入。
model-editors.test.ts: 锁定 Provider ID 配色在供应商改名后保持稳定，并覆盖无 ID 的新建供应商回退规则。
model-set-management.tsx: 通过生成 operation、TanStack Query/Form 和产品表格管理扁平模型集；成员写受管模型 ID。
token-capacity.ts: 将 Harness 十进制 K/M 容量格式转换为 Server 正整数 Token 契约。
token-capacity.test.ts: 锁定 256K=256000、1M=1000000 的容量语义门禁。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
