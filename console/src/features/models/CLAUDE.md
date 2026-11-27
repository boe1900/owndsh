# models/

> L2 | 父级: ../CLAUDE.md

成员清单

model-catalog.tsx: 通过生成 OpenAPI operation 和 TanStack Query 提供“模型与供应商”统一工作台；固定按 Provider→Connection→ManagedModel 树状展示，Provider/Connection 仅在无子项时允许删除，所有启停/删除均经确认弹窗，连接下属模型默认收起并由用户显式展开；页头复用 coss UI `Tabs`（含计数 `Badge`）与语义 token（Card/InputGroup/Select/Table/Button/Alert），仅 Provider 品牌渐变保留原始色板。
model-editors.tsx: Provider 元信息、连接 endpoint/API key、统一模型维护表单与删除确认；维护表单复用 coss UI `Input`/`Select`/`Switch`/`Field`/`Button`/`Alert`，载入连接已有模型并区分更新/新建保存，支持模型发现、手动维护、配置展开和视口内滚动，推理档位按 DSH 七档 canonical key 与独立 API 值逐行增删映射，内部 providerKey、alias 不进入用户输入。
model-editors.test.ts: 锁定 Provider ID 配色在供应商改名后保持稳定、连接复制默认值和推理档位补齐顺序。
model-set-management.tsx: 通过生成 operation、TanStack Query 与 coss UI 组件管理模型集；筛选栏承载新建入口，卡片与编辑器按供应商→连接→模型两层展示，模型集持有名称、可选描述与受管模型 ID，成员移出经过统一确认弹窗，仅 Provider 品牌渐变保留原始色板。
token-capacity.ts: 将 Harness 十进制 K/M 容量格式转换为 Server 正整数 Token 契约。
token-capacity.test.ts: 锁定 256K=256000、1M=1000000 的容量语义门禁。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
